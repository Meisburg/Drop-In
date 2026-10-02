# Slice 8b — fresh-context review, ROUND 2

**Verdict: NEEDS_CHANGES.**

**DISCLOSURE (required): I am a sibling model, not independent.** Same model family as the builder, and I was handed
the builder's report as an input. Everything below that is not a *measurement I ran in this turn* is weak evidence; I
mark what I ran. No code file was modified to produce this review — every probe ran in a throwaway copy under `/tmp`
against a throwaway `--root`, and this report is the only file I wrote.

**Range note.** `98db92f..7f5d9fa` contains **four** commits, not one: the two round-1 fixes (`17a2995`, `0f17891`)
plus `0a91821` (D-033) and `7f5d9fa` (round 2). I reviewed all four; the round-2 commit itself is 146/114/97-line
pure-addition work on three files (`slice-8b.md`, `factory-guard.check.mjs`, `factory-guard.mjs`) plus a
decisions-only commit.

## What I ran (raw, this turn)

| command | result |
|---|---|
| `node scripts/guards/factory-guard.mjs` | `671 of the 671 recorded occurrence(s) matched this scan (LOST COVERAGE 0)`; `654 fenced block(s) read, 2 range summaries checked`; `PASS` EXIT=0 |
| `node scripts/guards/factory-guard.check.mjs` | `all 120 checks passed` EXIT=0 (112 at `0f17891`, 115 at `98db92f` — counted, not quoted) |
| `node scripts/guards/trailing-newline-guard.check.mjs` / `lib-sibling-guard.check.mjs` | `all 10 checks` / `all 8 checks` EXIT=0 |
| `bash scripts/guards/run-all.sh` | `GUARDS: PASS — all deterministic rules hold.` EXIT=0 |
| `bash scripts/steering-lint.sh` | `PASS — steering layer is clean.` EXIT=0 |
| `bash scripts/slice-diff.sh 6c` | REFUSING on the fix-round base, names line 7156, EXIT=1; `1`/`3` resolve, `8a`/`8b` refuse; usage block complete |
| derived `BARE_HEAD_BASELINE` by emptying the map in a copy and running it over this repo | `committed 437 keys / 671 occurrences` == `derived 437 / 671`; LOST keys 0, GAINED 0, COUNT CHANGED 0 |
| derived `TRANSCRIPT_QUOTATION_BASELINE` the same way | the emptied map's own findings are exactly `slice-8a-verify-5.md:37` and `slice-8b-review.md:89` — the two committed entries |
| map at `98db92f` and `0f17891` vs the round-2 tip | `435 keys / 669 occ` both; **0 keys absent at the tip, 0 counts reduced** — forward-only holds across the range |
| a copy with an empty `BARE_HEAD_BASELINE`, run on a clean throwaway root | `0 of the 0 recorded occurrence(s) matched this scan (LOST COVERAGE 0)` … `PASS` EXIT=0 |
| a copy with one extra (unmatched) key, run on this repo | `671 of the 674 recorded occurrence(s) matched this scan (LOST COVERAGE 3)` … `PASS` EXIT=0 |
| the eleven separator seeds, run one by one against the committed guard | 10 CAUGHT; my reading of "label inside the fence's opening line" ESCAPES (see NB5) |
| unforgeability, both directions, throwaway roots | new file + same text → EXIT=1 naming the newcomer only; **a report rewritten AT a recorded path → EXIT=0, PASS, silent** (BLK1) |
| second occurrence in the same file | EXIT=1, names the second block (`slice-8a-verify-5.md:8`) — the builder's claim HOLDS |

I did **not** run `npm run verify` or any e2e spec. The report's `Test Files 71 / Tests 2063 / oxlint 81 / AGENTS.md
1789` is specific and falsifiable, so I do not raise it as missing evidence; I simply did not reproduce it. Everything
about the guards step I did reproduce, and it matches the report's transcript line for line.

## Adjudication — one line each

- **D-032's shape is SETTLED and not re-opened — HOLDS.** `grep -n "LABEL_LINE\|attributed\|inBlock\|previousEnd\|unreadLabel"` on the guard returns nothing but a docblock sentence saying it is gone (1577, 1682); the round-2 diff's only hunks inside the reader are the baseline key lines, so the fence loop is byte-for-byte round-1's; the review's own B1 seed still exits 1 with the arithmetic finding (measured).
- **D-033 — the absorber is a RECORD, not a SYNTAX — HOLDS for content, NOT for path.** The new-file direction is verified (new file + identical text fires; the recorded file is absent from the findings) and the mutation that keys on text alone absorbs the newcomer (exit 1 → 0).
- **D-033 — the converse: can a report alone reach a pass? — NOT HOLDS as an absolute.** Three report-only routes reach PASS: indenting (declared + seeded), losing the shape (declared ceiling), and **rewriting a report AT a recorded path (undeclared, measured, silent)** — and the guard's own header says a report cannot forge this. See **BLK1**.
- **D-033 item 3 — the indented-code boundary — HOLDS.** Declared in the rule's ceiling list in scope language (factory-guard.mjs:1614-1622), seeded (check.mjs:1522-1541), and the seed flips under mutation (`readsEverything` → exit 0 → 1); the mutation is a DETECTION flip, not a wording change.
- **Forward-only, "cannot lose coverage" — HOLDS for the map, PARTIALLY for the measurement.** No key at `98db92f`/`0f17891` is absent at HEAD and no count shrank (measured); a second occurrence in the same file fires (measured). But loss is a `note —` that never moves the exit code, and deleting a *stale* key makes the loss number drop to 0 (measured) — see NB2.
- **B2 — the printing-vs-detection mutations — HOLDS, and it is a code fix.** `boundedWindow`/`noIndented`/`noQuoteRegion` and their anchors are gone (grep: no hits in either file); every remaining mutation check asserts the seed's `exit`, and the checker passes 120/120 with the mutated copy actually running.
- **B3 — `slice-diff.sh` and 6c — HOLDS, and it is a code fix.** Measured: 6c REFUSES naming the fix-round line, and the usage block is no longer truncated; `--` is stripped before the pathspec echo.
- **The N-items the builder claims fixed (round 1's N2/N3/N4/N5/N6/N8) — HOLDS, and they are code or prose, not sentences about code.** N2 = paired `STEP_RANGE_COUNT` + a real `greedyCount` detection flip; N4 = both checker headers re-worded *and* the missing mutations added (lib-sibling 3 mutations / 3 failure verdicts, trailing-newline 3 / 3 — counted); N5 = an `awk` usage extractor and a `--` shift; N6 = the unreadable class counted, named, and a FINDING with a broken-symlink seed and a mutation; N3/N8 = prose (correct); N7/N10 = unchanged and declared, which is honest.

## BLOCKING FINDINGS

### BLK1 — [FALSE CLAIM + UNDER-DECLARED BOUNDARY] the baseline is reachable by writing a report AT a recorded path, and the guard's authoritative header says the opposite

The docblock: `factory-guard.mjs:1646-1651` — *"A baseline is not forgeable from a report: the key is
`file::the offending line's text`, counted … **Producing a baselined citation requires editing THIS guard**, which is
a reviewed diff."* The header, which `docs/agents/code-structure.md` makes the authoritative statement of coverage:
`factory-guard.mjs:98-100` — *"absorbed only by the RECORDED baseline (D-033), **which a report cannot forge**"*.

The key names a **path**, and a path is writable. Measured, throwaway root, this guard, both recorded paths present:

    # both recorded files present; slice-8b-review.md holds the recorded un-prefixed line as recorded,
    # and .scratch/v28/reports/slice-8a-verify-5.md is a TOTAL FABRICATION that merely contains the recorded text
    exit=0
      note — transcript-summary-agrees: quotation baseline holds 2 recorded site(s), re-derived and never hand-added;
             a NEW site, or a second occurrence of a recorded one in the same file, is a finding
      PASS — the registry can be trusted and no work item claims evidence it does not have.

No finding, **and no `LOST COVERAGE` clause either** — the fabrication is silent. So the unforgeability property is
true of *content* (same text at a new path fires — that much is proven) and false of *path occupancy*: a writer who
reuses a recorded path is absorbed. D-033's own sentence carries the same overstatement ("they would have to edit the
guard"), so the builder implemented the ruling faithfully — the ruling's claim is what the mechanism does not
support, and the header repeats it in the strongest words the build law allows.

This is the same class D-032/D-033 exist for — *the content choosing whether the rule looks* — one rung down: not the
text, the location. The exploit's yield is narrow (it excuses the exact recorded text at the exact recorded path, and
anything else on that path still fires), which is why this is a **claim** defect with a small remedy, not a rewrite:
the boundary is either declared and seeded the way the indented boundary now is, or the sentence is narrowed to what
the mechanism does.

### BLK2 — [FALSE CLAIM + MECHANISM] the new `LOST COVERAGE 0` clause: its own comment says it is conditional, it is not, and at `0 of 0` it is vacuous

`factory-guard.mjs:1513-1517`:

    // LOST COVERAGE is a PRINTED NUMBER, not a claim: a baselined key that no
    // longer matches is a stale record, and a record that quietly stops matching
    // would make this guard green on a smaller corpus. The clause appears only when
    // the number is non-zero, exactly like the unresolvable-sha note beside it.
    console.log(`  note — no-bare-head-count: ${bareHeadAbsorbed} of the ${BARE_HEAD_BASELINE_SIZE} recorded occurrence(s) matched this scan (LOST COVERAGE ${BARE_HEAD_BASELINE_SIZE - bareHeadAbsorbed})`)

"The clause appears only when the number is non-zero" is false of the line it annotates: the `console.log` is
unconditional, and the real run prints `LOST COVERAGE 0` every time (first row of the table above). The sibling it
claims to mirror **is** conditional (`factory-guard.mjs:1522` — `${absorbed === UNRESOLVABLE_SHA_BASELINE_SIZE ? ''
: …}`), and so is the transcript clause the report says this one mirrors. This is D-028's shape exactly: a sentence
about the mechanism, shipped in the same commit as the mechanism, that the mechanism does not have.

**The dispatch's decisive question, answered with measurements:**

| state | printed clause | honest? |
|---|---|---|
| zero-match **key** (some keys matched, others not) — real repo + one stale key | `671 of the 674 recorded occurrence(s) matched this scan (LOST COVERAGE 3)` + PASS | **yes** — `size − absorbed` is exactly the number of recorded occurrences not matched, and it is never negative |
| zero-match **corpus** (clean throwaway root) | `0 of the 671 … (LOST COVERAGE 671)` + PASS | **yes** — alarming, correct |
| **empty map** (map emptied in a copy) | `0 of the 0 recorded occurrence(s) matched this scan (LOST COVERAGE 0)` + PASS | **no, as a coverage claim** — literally true, semantically vacuous: it cannot distinguish "the record is fully covered" from "there is no record" |

So the clause is **arithmetically honest in every non-empty state, including zero-match** — and in the one state that
is the *maximal* version of the thing the clause exists to catch (a record that shrank to nothing), it prints the
greenest possible number. It also never gates: LOST > 0 moves nothing, the run still prints `PASS` and still publishes
the `ok —` claim *"no report or brief count resolved through bare HEAD beyond the recorded baseline"* (measured:
LOST 671 with `PASS`). And no check mentions the clause anywhere (`grep -rn "LOST COVERAGE" scripts/guards/` returns
four lines, all in `factory-guard.mjs`: two `console.log` sites and the two comments describing them; nothing in
`factory-guard.check.mjs`), so the clause's own correctness is unwatched — the one thing round 2 added that
nothing re-runs.

## NON-BLOCKING FINDINGS

- **NB1 [WRONG NUMBER]** `slice-8b.md:777` — *"112 → 120 checks, every one of the six new checks with a mutation whose exit code moves."* The commit adds **eight** `check(` calls (I counted the additions: 8) and the runtime delta is 112 → 120 = 8 (both measured). "Six" matches no subset of the eight. The harness block quoted below that sentence is verbatim-accurate, all eight lines; only the count is wrong.
- **NB2 [MECHANISM]** The clause is a *snapshot*, not a tripwire. Measured: adding one stale key moves the printed number from `LOST COVERAGE 0` to `LOST COVERAGE 3` and removing it moves it back — **both runs PASS**, so deleting the evidence of loss is how the number is made green. The docblock's *"A site leaves the map only by re-derivation — never by typing an entry away"* (`factory-guard.mjs:1657-1658`) is a process promise the mechanism cannot enforce; that is inherent to the recorded-baseline form (D-021/D-023) and is worth stating rather than implying.
- **NB3 [FALSE CLAIM, small]** `slice-8b.md:820` calls the new clause one that *"mirror[s] the clause `UNRESOLVABLE_SHA_BASELINE` already prints one rule over"* — the sha clause is conditional, the new one is not (BLK2). Same class in the transcript docblock, `factory-guard.mjs:1655-1656`: *"the run prints its size every time **and says how many of the recorded sites it saw**"* — it prints the size every time, but says nothing about how many it saw when all were seen (the clause is omitted then; measured on this repo).
- **NB4 [MECHANISM, latent]** `absorbed` for the quotation baseline counts absorbed **findings**, not matched sites: `factory-guard.mjs:1732` (`if (count === span) continue`) returns before the increment at `:1733-1735`, so a recorded key that still matched but whose arithmetic had become correct would be reported as *not* matched and counted as lost coverage. Unreachable today, because every entry is derived from a finding — but the note's word "matched" is stronger than the number it prints.
- **NB5 [MECHANISM / evidence, round-1 residue]** The report's *"eleven attempts, all CAUGHT"* sweep (`slice-8b.md`, Fix round 1) is harness-seeded for **five** of eleven (check.mjs:1345-1374 = four separators in a loop; check.mjs:1330-1338 = the blockquote seed). `indentbetween`, `htmlcomment`, `twolabels`, `~~~`-only, `~~~`-label and label-inside-fence-line were measured once and are not re-run. I reproduced ten of the eleven descriptions as CAUGHT at HEAD; my reading of "the label inside the fence's opening line" — label *before* the fence on the same line — ESCAPES (exit 0, `NOTHING was compared`), which is the declared *unfenced* ceiling, not a new hole. Structurally the family is closed (there is no attribution left to break), so the residual risk is low; the evidence claim is what is thin.
- **NB6 [honesty nit]** `slice-8b.md` §1's *"The run prints, verbatim:"* block prints the repo's real first line and then a synthetic `LOST COVERAGE 1` second line, elided and bracketed — annotated, but labelled verbatim. §2's block, by contrast, I reproduced exactly.

## "Which set did I just stop watching?" (D-030, applied to what round 2 added)

1. **The two recorded quotation sites** (check: emptied-map derivation) — the only two lines this rule ever fired on this corpus, now excused by construction. The `LOST COVERAGE` clause is the only watcher, and it does not gate.
2. **The two added bare-head keys** in `slice-8b-review.md` — same shape, same non-gating watcher.
3. **The path-occupancy direction of the absorber.** No seed, no mutation, no declaration; and the header says it is impossible (BLK1).
4. **The six unseeded separators** from the round-1 sweep (NB5).
5. **The `LOST COVERAGE` clause itself** — no check names it (NB2/BLK2). A future edit can delete it, invert it, or print `NaN` and the harness stays green.
6. **The claim list when coverage is lost.** The `ok —` line still asserts *"no report or brief count resolved through bare HEAD beyond the recorded baseline"* while the printed number says the entire baseline failed to match — the claim is published exactly when the measurement is empty (measured: LOST 671 + `PASS`).

## Requirements traceability

| requirement | status | evidence |
|---|---|---|
| D-032 settled, shape unchanged this round | **met** | no label/region/tripwire identifiers in the guard; the reader's only round-2 hunks are the baseline key lines; the review's B1 seed still exits 1 |
| D-033 — absorber is a recorded baseline, re-derived | **met** | emptied-map derivation reproduces both committed maps exactly (437/671 and the two sites); 0 keys lost/gained/ moved across `98db92f → HEAD` |
| D-033 (2) — unforgeable: new file, same text, fires | **met** | measured: EXIT=1 naming `zz-new-quoter.md:4`, the recorded file absent from findings; text-only-key mutation flips it (1 → 0) |
| D-033 (2) — converse: report-only edits cannot reach a pass | **not met** | three routes reach PASS; the path-occupancy route is undeclared and silent (**BLK1**) |
| D-033 (3) — indented boundary declared, seeded, mutatable | **met** | `factory-guard.mjs:1614-1622`; `check.mjs:1522-1541`; mutation exit 0 → 1 |
| Baseline forward-only; second occurrence in the same file fires | **met** | map diff across the range: 0 keys removed, 0 counts reduced; second-occurrence seed measured EXIT=1 (`slice-8a-verify-5.md:8`) |
| Baseline "cannot lose coverage" | **partially met** | loss is printed (measured: LOST 3, LOST 671) but never gates, is vacuous at 0/0, and can be silenced by deleting a stale key (**NB2**, **BLK2**) |
| Round-1 B2 (printing-only mutations) | **met** | anchors and their machinery deleted; all remaining mutations assert `exit`; 120/120 with mutants actually executing |
| Round-1 B3 (`slice-diff.sh` 6c) | **met** | measured refusal naming `ledger.md:7156`; usage complete; `--` stripped |
| Round-1 N2, N4, N5, N6 | **met** | code + seeds + mutations, all measured; checker counts 10 and 8 match the re-worded headers |
| Round-1 N3, N8 | **met** | prose, and correctly prose |
| Round-1 N7, N10 | **declared, not fixed** | unchanged; disclosed as such — honest |
| Gate green | **met** | `GUARDS: PASS` EXIT=0; `PASS — steering layer is clean.` EXIT=0; guard output matches the report line for line (`npm run verify` itself not run by me) |
| No lane report edited | **met** | the round-2 commit touches three files, all additions (`146/0`, `114/0`, `97/14`); no `.scratch` report other than the builder's own |

## Recommended next action

Fix BLK2 by making the annotation and the clause agree — either the clause becomes conditional as its comment says,
or the comment says what the code does and the `0 of 0` state says in words that there is no record to cover; and fix
BLK1 by declaring the path-occupancy boundary with a seed (as the indented boundary was declared and seeded) or by
narrowing the header/docblock sentence to the property the mechanism has. Everything else I measured holds: both
baselines derive exactly, nothing was lost across the range, the new-file direction and the count are proven, the
indented boundary is declared and load-bearing, and the round-1 B2/B3/N-item fixes are code and checks rather than
sentences about code.

**DISCLOSURE, repeated:** sibling model, not independent. The measurements above are the evidence; the report's prose
is an input I am judging, not corroborating.
