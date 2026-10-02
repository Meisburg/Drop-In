# Slice 8b — BREAKER-REPAIR review, ROUND 6 (the independent lane, third round on this rule)

    Verdict: NEEDS_CHANGES

**THE ONE-LINE ANSWER to the brief's question ("is the family closed, and is the new fixture a real instrument?"):
the CLOSURE question is closed and the fixture is real — every load-bearing claim of the breaker repair measured
true in my hands — but the fence-RECOGNITION family is not closed: the seventh-shape attempt SUCCEEDED, twice.**
Per the brief and per the stop condition these are REPORTED, NOT PATCHED, and D-032/D-037 then fire; the ruling is
the orchestrator's.

DISCLOSURE: I am the independent lane (different model family from the builder); my round-4/5 reports found shapes
5 and 6 and sharpened the stop condition that this round's repair was named under. Every number below was produced
by a command in this turn. No repository file was edited by me; all probes ran in /tmp (throwaway roots, surgery
copies, detached worktrees) except the two committed checker runs the gates name.

## What the repair got RIGHT — measured, not believed

- **The closer clause (factory-guard.mjs:1804) is CommonMark's closing-fence clause** — same kind, run >= opener
  length, indent `/^ {0,3}$/` (spaces only), suffix `/^[ \t]*$/` (spaces-or-tabs only). The opener branch
  (:1794-1800) keeps the declared any-whitespace over-read. The three sentences rewritten this round
  (header ~:91-97, docblock :1641-1649, parser comment :1770-1790) now state the implemented rules.
- **The fixture is a REAL instrument, not a mirror.** Three independent legs:
  1. *Reference-derived*: I re-ran the committed derive script (7b69bf2's bytes) against the real references in
     /tmp/mdref — `MDREF=/tmp/mdref node /tmp/r6/derive/committed.mjs` → exit 0, stderr `26 case(s); 0
     reference-vs-reference disagreement(s)`, stdout **byte-identical** with the committed
     `fence-conformance.fixture.json` (diff empty). The table reproduces from the reference; it is not a
     transcription of the guard.
  2. *Not a mirror of the old guard*: the PRE-fix parser (f3cf360, lifted by the checker's own anchors) diverges
     from the committed table on **exactly 6 of 26** cases — exactly the six names the round report lists
     (4-space/8-space/tab-indented closers, vertical-tab and NBSP suffixes, tilde 4-space closer). A table typed
     from the fixed guard would also show this; a table typed from the reference shows it too; only the reference
     leg (1) distinguishes — and it held.
  3. *Every clause load-bearing*: five mutants (openers disabled / closers disabled / indent clause dropped /
     suffix clause dropped / length clause dropped), each run through the same lift+table comparison: 23 of 26, a
     loud runtime crash, 4 of 26, 5 of 26, 2 of 26 divergences — the table FAILS on each regression it guards
     against. The fixture holds **zero** `blocks: []` entries, so an always-empty lifted parse diverges on
     26 of 26.
- **The lifting seam is sound.** `guardFenceParser` (factory-guard.check.mjs:119-127): both anchors occur exactly
  once in the committed guard (grep -c = 1 / 1); an anchor-miss throws; every neuter I could construct is loud
  (crash or mass divergence). The "silently lift an empty function and still report success" scenario has no
  construction in my hands: the empty-opener neuter crashes (the closer branch dereferences `open`), and any
  push-neuter diverges from the table on most cases. The D-030 empty-table guard is present
  (:1881-1885), the divergence summary closes the block (:1894-1898), and the two new seed/mutation pairs
  (shorter-closer, 4-space-indented closer) run the REAL binary and assert exit flips — the 178 gate
  arithmetic checks out (146 + 2 + 2 + 28).
- **The tab drop was the RIGHT call.** Measured: a closing line with a trailing tab after the run — commonmark
  0.31.2 closes ([[1,2]]), marked 18.0.14 keeps content ([[1,4]]); the spec's wording allows spaces OR tabs. The
  guard closes, matching the canonical reference. Per D-037 a reference disagreement is an oracle bug — the seed
  is shrunk to agreement — and 7b69bf2 did exactly that (the case removed from both the table and the CASES list;
  the earlier prose adjudication of 47a5de3, a kept case with a `note`, is gone in the committed state). The
  drop's residual: the guard's tab-suffix behavior is now unpinned by the table — but any drift of the suffix
  clause is over-read direction (merges, reads more) and the sibling NBSP/VT table cases pin the clause's
  acceptance width; no escape-class risk remains from the drop.
- **The false `LOST COVERAGE 0` sentence is deleted, not softened** (factory-guard.mjs:1740-1742 area: the
  sentence is gone; the re-derivation note remains). The "no markdown parser in this tree" claim holds (measured:
  no `marked`/`commonmark` in package.json, package-lock.json or node_modules). D-038's
  `docs/agents/borrowed-guards.md` citation is real (the file exists). D-038's trade-off statement is accurate.
- **Green gates, measured at the slice tip (7b69bf2, clean worktree):** `factory-guard.check.mjs` → all 178
  checks passed, exit 0; `lib-sibling-guard.check.mjs` → 8 of 8; `trailing-newline-guard.check.mjs` → 10 of 10.
- **The dispatch-red story is true as told:** at f3cf360 the guard is red on exactly one factory finding, at
  `.scratch/v28/reports/slice-8b-review-5.md:129` (no-bare-head-count) — I reproduced it in a worktree at
  f3cf360. The in-range fix of that line is one sentence of MY OWN round-5 report corrected from "at HEAD" to
  "at 341c0bb" — and my round-5 report's own header verbatim says I re-ran that round "against HEAD (341c0bb)",
  so the corrected sentence states the commit I measured at and is TRUE. It went into a commit whose other
  contents are the builder's; the commit is single-authored so git cannot separate lanes; content is what I
  verified, and it is correct.

## Blocking findings

### 1. THE SEVENTH DIVERGENCE — CRLF line endings: the guard recognizes NO fence in a \r-suffixed file
    label: [UNDER-DECLARED BOUNDARY + FALSE CLAIM + MECHANISM]

**Input (one new report file, CRLF terminators, in a root whose scan also contains one ordinary LF report):**

    $ printf '## zz crlf probe\r\n\r\n```md\r\nharmless\r\n[CRLF-CHECK-MARK] 7-13 zz-spec.e2e.ts (all six legs)\r\n```\r\n' \
        > <root>/.scratch/v28/reports/zz-crlf.md
    $ node scripts/guards/factory-guard.mjs --root <root> --repo .
      note — transcript-summary-agrees: 1 fenced block(s) read, 1 range summary checked   <- the LF file's block
      (no finding; the CRLF file's fabricated line was in a REAL CommonMark fence, per both references)
    PASS — ... ; exit 0.

Measured on the real guard binary at the slice tip: the composite scan counts one block/one summary (the LF
file's) and PASSES at exit 0 while the CRLF file's fabricated `7-13 ... (all six legs)` line — **fenced in both
references** (commonmark 0.31.2: fenced; marked 18.0.14: fenced, LF-normalized) — is read by NOTHING. In a
SINGLE-file scan the D-030 "read no fenced block at all" tripwire instead fires (measured: fail-closed) — so the
tripwire covers exactly the pathological whole-scan case and NOT the composite case a real scan is.

**Root cause** (factory-guard.mjs:1766: `readFileSync(path, 'utf8').split('\n')` never normalizes \r; :1795: the
shared marker regex `^(\s*)(`{3,}|~{3,})(.*)$` — `.` does not match \r and `$` without /m cannot match before it,
so a \r-suffixed marker line is not a marker: no fence OPENS and no fence CLOSES in a CRLF file. CommonMark
normalizes line endings (per spec), both references do, the guard does not.

**Classification per the stop condition (D-037, factory/decisions.md:1074-1085):**
- D-037 #2's oracle test, by its LETTER, fires: run the reference over the reviewer's construction; the
  references agree with each other; the guard parses the file AS IF IT HAS NO FENCES; the divergence direction is
  a dropped reference-fenced line (under-read); the shape is constructible and latent (D-037 #4: the corpus is
  measured ALL-LF — 0 CRLF files over the whole scan set; latency makes it affordable, it never defines the
  trigger).
- The #3 carve-out does NOT reach it: the carve-out names the declared indented-opener over-read; the CRLF shape
  is not that boundary, and its observable is a DROP, not an over-read.
- The one thing that could exempt it is the stop's own wording — "a SEVENTH divergence in fence closure" —
  because the CRLF shape diverts at fence RECOGNITION (nothing opens), not at closure. I name that reading
  honestly, and I note what it would mean: the stop condition would then have a TAXONOMIC HOLE exactly at a
  simpler, higher-yield seam than the six shapes it was built to police. Ruling options as recorded: D-032's
  terminal clause (delete the rule / record known-open, never silent) or — as D-038 (:1088-1110) already prices —
  take the rung FIRST (the reference's fence recognition), which cures line endings, the indented-opener family
  below, and all six shapes by construction, provable against the fixture that this round built for exactly that
  purpose.

### 2. The declared opener over-read's pricing is falsified — the phantom-close drop family
    label: [FALSE CLAIM + UNDER-DECLARED BOUNDARY]

**Input (single file, LF — measured end-to-end with the real binary at the slice tip):**

    $ printf '# zz P0 probe\n\n    [FENCE-OPENER-INDENTED]\n[FENCE-CLOSER]\n[CHECK-MARK] 7-13 zz-spec.e2e.ts (all six legs)\n[FENCE-CLOSER]\n'
    $ node scripts/guards/factory-guard.mjs --root <root> --repo .
      note — transcript-summary-agrees: 2 fenced block(s) read, 0 range summaries checked — NOTHING was compared
      PASS — ...
      → **exit 0**, the exact D-031/D-032 signature, reachable by construction.

The literal seed is: a fence-opener line indented four pure spaces; a bare same-kind line at indent 0; the
fabricated range/count line; its closer. The guard over-reads the indented line as an OPENER (the declared
boundary), then consumes the NEXT line — the real fence's OPENER — as the phantom block's CLOSER, so the
fabricated line, which **both references fence** (commonmark 0.31.2: one fenced block whose content covers
exactly that line; marked 18.0.14: two code tokens, the second covering it — the references AGREE on
membership), lands in no guard block at all. measured across a 30,172-input structured fuzz over the full
open/mid/close cross-product: **98 dropped reference-fenced pair-lines**, every one traced to the opener clause —
26 with pure-space indents >= 4 columns, 70 with tab/NBSP `\s` indents, **zero with a <=3-space opener** — which
is also the positive half of this finding: the CLOSURE clause itself produced no residual divergence anywhere in
the fuzz.

**The falsified claims, by line** (both written this round, in the sentence that corrected the round-5 wording):
- factory-guard.mjs:1671-1673 — "An OPENER is read after leading whitespace with NO indentation limit —
  recognising more openers reads MORE, which is the safe direction —": FALSE as stated. On the P0 input the
  extra opener reads FEWER reference-fenced lines than a conformant parser would (the guard's read set is not a
  superset; it drops the line both references fence).
- factory-guard.mjs:1774-1776 — the parser comment's "ANY amount, the declared safe over-read, where recognising
  more openers reads more" — same falsification.
- **My own round-5 sentence pays the same bill, and I record it:** slice-8b-review-5.md said the opener over-read
  is a boundary "where the direction is genuinely safe (recognizing more fences read MORE)". That was written by
  me, it is wrong by the same construction, and D-037 #3 (factory/decisions.md:1078-1080) — the carve-out I
  proposed — was adopted on the strength of that pricing. The carve-out SURVIVES only with its scope restated: it
  immunizes the boundary's OWN over-reads (blocks the guard reads that the reference calls indented code), NOT
  the dropped reference-fenced lines the boundary's phantom-close consequence produces — by D-037's own shape
  definition ("Every one of the six shapes is a reference-fenced line the guard DROPS"), P0's observable is a
  family shape, not a boundary cost. Either the carve-out is re-scoped this way (in which case this family is the
  trigger and D-032/D-037 fire on it too), or it is widened to immunize drops (in which case the shape definition
  dissolves and the stop is meaningless). I report both readings; the first is the one the mechanism's own
  sentences support.

**Classification per the stop condition:** as with finding 1, the letter of "divergence in fence closure" does
not name the opener; D-037 #2's oracle test does. The repair this round was authorized as the CLOSER clause.
Whatever the ruling on the numbering, BOTH families produce the signature the whole fence family exists to close,
both are constructible, both are latent on this corpus. They are reported, not patched, per the brief.

## Non-blocking findings

- **fence-conformance.derive.mjs:19-23 vs :125-129 — [MECHANISM + one false sentence, dev-time]** the header
  says "A case on which the two references disagree is NOT recorded — the seed is shrunk until they agree"; the
  code records ANY case regardless (`return { name, source, blocks }` runs for a disagreeing case too; the
  disagreement is only counted and printed to stderr). The committed table honors D-037 only because the
  tab-suffix case was deleted BY HAND in 7b69bf2 — correct outcome, unenforced mechanism. A blind future
  re-derive (the header's own command redirects stdout to the fixture; stderr unwatched) would commit a
  disagreement-pinned case. The claim describes behavior the script does not implement.
- **Corpus parity (the latency record for both families):** guard-vs-commonmark membership over all 58 reports +
  104 briefs at the slice tip: **0 commonmark-vs-guard divergences on any reference-fenced pair line** — both
  families are constructible-not-live today. (The "marked-only" outliers the parity run prints are lines where
  commonmark — the authority — AGREES with the guard and marked alone differs; D-037's oracle-bug class, and
  nothing to shrink.)
- **Measurement-note, not a defect of the slice:** `run-all.sh` inside a detached `git worktree` reds
  copy-field-consumption and copy-taxonomy checkers with EMPTY failure reasons (their child runs need
  `node_modules`, which a worktree does not carry); measured green in the checkout, whose `scripts/` is
  byte-identical from 7b69bf2 to the working tip. The only real red in the checkout is an UNTRACKED file of a
  parallel verify lane (`slice-8b-verify-6.md`) — not in this review's range.
- **`npm run verify` at the slice tip was NOT re-run by me** (out of my lane's scope, as in prior rounds). The
  round report quotes it with specific numbers; every intersection of that claim with my lane (checker counts,
  guard findings, the fixture, the sibling checkers) measured true, and the follow-up commit (f1c6275) records
  the same gates.

## The standing hunt (D-025 / D-030)

- **Claims the mechanism does not support:** the ceiling's "safe direction" pricing (blocking 2); the derive
  script's "NOT recorded" sentence (non-blocking); the header's "read by CommonMark's own fence rules" over a
  CRLF file (blocking 1 — the sentence is the build-law's scope statement, :91-97, and it is false on that
  input). Everything else I attempted I made true by running it: the closer clause on 30k fuzz inputs + 26 table
  cases; the sentence-rewrites on every shape I shipped in rounds 4-5 plus the new matrix; the 178 checker's
  mutation set (exit-moving, seeds assert the fired guard's own text); the D-030 guards (empty table, empty
  block-set, empty records, zero-claim gates all present and green in the 178 run).
- **Sets that stopped being watched:** the guard drops reference-fenced lines on CRLF input (blocking 1) and —
  by the declared opener boundary's consequence — around over-read openers (blocking 2). Nothing ELSE stopped:
  the claim gates still gate over measured counts; both new seeds still fail their mutants; the records still
  print sizes; check 13's fixture world still loud in both directions.

## Commands run this turn (the load-bearing ones)

- `MDREF=/tmp/mdref node /tmp/r6/derive/committed.mjs` (the 7b69bf2 derive script's bytes) → exit 0,
  `26 case(s); 0 reference-vs-reference disagreement(s)`, stdout byte-identical with the committed fixture.
- `node /tmp/r6/prefix.mjs` (f3cf360's parser vs the committed table) → PRE-FIX divergences=6 of 26, exactly the
  report's six names.
- `node /tmp/r6/fuzz.mjs` (30,171 structured inputs, three-way: lifted guard vs commonmark 0.31.2 vs marked
  18.0.14) → 98 pair-line drops; `node /tmp/r6/classify.mjs` → every drop opener-rooted (26 pure-space >= 4, 70
  tab/NBSP, 0 plain).
- `node /tmp/r6/seam.mjs` / `seam2.mjs` (anchor-miss; five clause-neuters vs the table) → anchor-miss throws;
  neutered mutants diverge on 23/4/5/2 of 26 (empty-opener neuter crashes) — no silent lift.
- The real binary, throwaway roots at the slice tip: the P0 root → `2 fenced block(s) read, 0 range summaries
  checked — NOTHING was compared`, PASS, **exit 0**; the CRLF-composite root → `1 fenced block(s) read,
  1 range summary checked`, fabricated line unread, PASS, **exit 0**; the CRLF single-file root → the D-030
  empty-block-set finding, exit 1.
- `(cd /tmp/r6/wt && node scripts/guards/factory-guard.check.mjs)` → all 178 checks passed, exit 0; lib-sibling
  8 of 8; trailing-newline 10 of 10 (both at the tip).
- Corpus parity (162 scanned files) → 0 commonmark-vs-guard divergences on pair lines.
- Honesty note: my FIRST fuzz run was vacuous and I discard it — my own transcription of the rule's pair regex
  added a closing paren the committed regex (factory-guard.mjs:1702) does not have, so the probe matched nothing;
  the corrected command above produced the 98.

## Recommended next action

Adjudicate both families under D-032/D-037 (the stop's wording vs D-037 #2's oracle test — my reading: the CRLF
family is the seventh divergence and the P0 family trips with it once D-037 #3's carve-out is re-scoped to
"the boundary's own over-reads, never its drops"), then take D-038's rung BEFORE any delete: the fixture this
round built is the proof instrument for exactly that swap. In the same ruling, re-price the two falsified
sentences (factory-guard.mjs:1671-1673, :1774-1776) and either implement the derive script's "NOT recorded"
sentence or correct it.
