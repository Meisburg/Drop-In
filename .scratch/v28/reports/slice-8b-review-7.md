# Slice 8b — RUNG FINAL REVIEW, ROUND 7 (the independent lane, fourth round on this rule)

    Verdict: NEEDS_CHANGES — ONE sentence of declaration; no scanner or parser change; no clause patch.
    The D-039 eighth-divergence question: NO — the rule is NOT deleted.
    The instrument question: CLOSE the rule. It earned its keep; the cost curve broke at the rung.

Everything below was re-measured this turn against the committed tip (`8f9d105`, plus the working tree's
untracked lane reports, unedited). No repository file was touched by this review; all probes ran in /tmp
(`/tmp/x7`, plus the surviving `/tmp/mdref` reference install from round 6) except the committed gate runs
and this report, which is the only file written.

## Q1 — Is the scanner the reference, or a paraphrase that agrees on the fixture?

**THE REFERENCE'S CLAUSES. Four independent legs; a fixture-shaped paraphrase is falsified:**

1. **Byte-level vs the real package** (`/tmp/mdref/node_modules/commonmark@0.31.2/lib/blocks.js`): every
   transcribed clause is verbatim as claimed — `:7` `CODE_INDENT = 4`, `:48` `reCodeFence`,
   `:50` `reClosingCodeFence`, `:54` `reLineEnding`, `:403-409` the closer's three conditions
   (`indent <= 3`, first non-space char === `_fenceChar`, `match[0].length >= _fenceLength`),
   `:744-765` `findNextNonspace`'s column arithmetic (space +1, tab to the next multiple of 4),
   and the opener's `!parser.indented` limit (`blocks.js:~505`) behind the scanner's
   `column >= CODE_INDENT` refusal.
2. **17 adversarial shapes the fixture does NOT contain**, all agreeing at top level: a fence
   interrupting a paragraph; indented code then a fence at column 0; the P0 shape (indented fence +
   bare line + fabricated line); a ` ```  ``` ` double-run line; setext heading then fence; thematic
   break inside fence content; NUL inside content; tilde opener with a tilde-carrying info string;
   tab+space closer landing at exactly the 3/4 column boundary; empty and newline-only files.
3. **The fixture is not a mirror of the scanner**: a fresh re-derivation from the live npm packages
   (`MDREF=/tmp/mdref node scripts/guards/fence-conformance.derive.mjs`) is byte-identical with the
   committed table — **30 cases, 0 reference-vs-reference disagreements, sha256
   `1fd15786…` matching the report's recorded value**. The table's bytes come from the reference, not
   from the scanner; and the tab-suffix disagreement with `marked` stays dropped per D-037 §2.
4. **Corpus parity, whole scan set, per line**: 164 files, 26 508 non-blank lines, **0 membership
   divergences** between the shared scanner and the real commonmark parser.

The only constructible scanner-vs-commonmark divergences anywhere are the two named in Q4: the DECLARED
container refusal (under-read) and an HTML over-read (undeclared — this round's one finding). Both are
boundary constructs, not fence-language ones; the fixture could not have trained either.

## Q2 — Does the fuzz prove convergence, or share a blind spot?

**REAL ORACLE — it does not agree with itself. NARROW ALPHABET — it shares the declared blind spot.**

- The oracle is a different implementation: `wfuzz.mjs` (the wide harness) computes per-line membership
  from the real `commonmark 0.31.2` parser's fenced `code_block` sourcepos; the fixture's second opinion
  is `marked` 18.0.14 with its disagreements dropped. The scanner's code never enters the oracle, and the
  corpus is generated line-token-by-line-token — nothing about the scanner's design shapes the inputs
  beyond the token inventory. Re-run this turn: POST-swap **0 divergences on all 8 runs × 20 000
  (LF/CRLF/CR/mixed × closure-only/all-indents) = 0 of 160 000**; PRE-swap wide-LF reproduces
  **10 359 / 2 227 UNDER / 9 603 OVER** exactly — the round's table is real.
- The blind spot, stated plainly: the alphabet is top-level fence-line language (marker tokens, text,
  headings, indents 0-8 spaces + tabs, line endings). It cannot generate a container line or an HTML
  start tag, so the fuzz **cannot falsify the boundary claims** — those rest on the headers'
  declarations and on reviewer probes (this turn: measured, Q4). Convergence is proven exactly over the
  domain the rule claims; the boundary is declaration-pinned, not measurement-pinned. That is the
  truthful form of "closed": closed for the instrument's claimed language, with the boundary declared —
  not closed over all of CommonMark, and no evidence is offered that it is.

## Q3 — `scripts/lib/fence-scanner.mjs` outside the header scan: acceptable, or the hiding hole?

**For THIS module: acceptable — and only this round's eyes made it so. For the NEXT module: it is the
exact hiding hole, one rule line away from being closed.**

- The machine reaches the scanner's BEHAVIOUR: the fixture re-derives byte-identically from the live
  reference, the fuzz and my probes ran its real bytes, the checker's mutation machinery
  (`applyMutations`, factory-guard.check.mjs:100-107) throws on any anchor-count ≠ 1 and the CRLF
  mutation's verdict flips end-to-end. The header's factual sentences I verified verbatim this turn.
- The machine does NOT reach its PROSE: `checkInstrumentHeaders` reads `scripts/guards/*.mjs` one level
  only (factory-guard.mjs:483-485); `lib-sibling-guard.sh:44` is hard-coded `LIB_DIR="src/lib"` — the
  build law's "every lib/ module ships a sibling test" does not reach `scripts/lib` (ledger-recorded at
  `8f9d105`), and `fence-scanner.mjs` has no sibling file in its own directory (its tests live in
  `factory-guard.check.mjs`'s fixture block).
- `docs/agents/borrowed-guards.md` gained **no entry for the first vendored module** — D-038 named that
  doc as the venue ("vendored with provenance under docs/agents/borrowed-guards.md"); the implementation
  restates the four criteria in the module header (fence-scanner.mjs:36-62) and only POINTS at the doc.
  A header lie about provenance (say, "source: marked 18.0.14") would fail no rule.
- So yes — a next unprovenanced borrowed module at `scripts/lib/*.mjs` hides here by construction.
  It is a hole for the guard SUITE, not a defect of this diff's code. Closing it is one of: point
  `lib-sibling` at `scripts/lib` too (its sentence already reads "every `lib/` module"), add
  `scripts/lib/*.mjs` to the instrument-headers file set, or make `borrowed-guards.md` the registry
  with a grep. The ledger records the sibling half; the provenance-header half is new in this report.

## Q4 — An EIGHTH divergence? Plainly: **NO of the class D-039 fires on. The rule is not deleted.**

Two constructible divergences exist, and neither is the family the stop condition polices:

**A. Container under-reads — DECLARED.** `> ```md / > ✓ 7–13 … / > ``` ` and the list-continuation
fence (`- x` then four-space-indented ` ```md `): both references derive a fenced block; the scanner
reads none (measured, both shapes, real binary). End-to-end composite scan (one clean LF report + one
blockquote-fenced fabricated line) → **`1 fenced block(s) read, 0 range summaries checked —
NOTHING was compared`, PASS, exit 0** — the D-031/D-032 signature IS reachable through the boundary.
This is round 1's C1, adjudicated five rounds ago as the declared marker-position boundary; the refusal
is declared in three instruments (scanner header "container machinery … refused", fixture header
"outside this line-based table", derive header), the ceiling's own bullets cover both letter-shapes
("a marker with TEXT BEFORE IT on the line"; "an opener indented four columns or more"), and the corpus
is clean of container-fenced lines (0 over 164 files; parity 0 divergences). Latent, declared, adjudicated
— not a new shape, and not this rung's doing: the old parser refused them the same way.

**B. HTML-block over-read — UNDECLARED (this round's one required change; NOT an eighth divergence).**

    Input:  <div class=x>
            ```
            ✓ 7–13 zz-spec.e2e.ts (all six legs)
            ```

  Both references derive **no fenced block** (commonmark 0.31.2: 0 fenced `code_block`s; marked 18: one
  `html` token — measured). The shared scanner reads `{content, end}` for the inner lines: the type-6
  HTML block runs to the blank line and swallows the ` ``` ` lines, but the scanner has no HTML state,
  so it opens and closes a fence. End-to-end, the real binary **FIRES the transcript finding at exit 1
  on a line both references keep unfenced** (measured on a throwaway root: `FINDING
  [transcript-summary-agrees]: .scratch/v28/reports/zz-html.md:3 — covers 7 entries (7–13) but states
  "(all six"`). D-037 §2's oracle letter (both references agree; the guard parses differently) is
  satisfied BY THE LETTER; **D-037 §3's direction rule decides it**: an over-read can never produce the
  `0 … compared`/PASS/exit-0 signature the whole family exists to close — it only ADDS reads (measured
  direction above). The shape is therefore a DECLARED-BOUNDARY item, not a patch, not a clause, not a
  delete trigger. The same behaviour existed in every hand-written round (none of my earlier fuzz
  alphabets contained an HTML tag either); what is new is that the round-7 claims ("every fenced block
  whose marker starts a line is read … using the reference's own fence recognition") now sit beside a
  ceiling that promises exhaustiveness — "CEILING, named rather than implied — the exact shapes"
  (factory-guard.mjs:1683) — and name no read-MORE shape.

Blocking finding (the round's one):

  - scripts/guards/factory-guard.mjs:1683 + scripts/lib/fence-scanner.mjs:41-44 — [UNDER-DECLARED
    BOUNDARY] the ceiling claims to name "the exact shapes" and names none of the over-read direction;
    the scanner's refused-list names containers but not HTML blocks; a constructible top-level input
    (above) reads a block both references deny. Required change: ONE ceiling sentence declaring the
    HTML over-read, D-028 direction — e.g. "a fence marker inside an HTML block is ALSO read (the
    scanner has no HTML state at the top level): an over-read, the safe direction — both references
    agree no fenced block exists there." It lowers the claim to the mechanism's truth; it widens no
    mechanism; it is not a D-037 §1 stop event (it declares existing behaviour, it does not narrow a
    claim that hid a divergence). No code change, no seventh clause, no parser touch.

Non-blocking findings:

  - .scratch/v28/reports/slice-8b.md §6 — [WRONG NUMBER] "The checker's fixture block now runs the
    shared scanner over **34 case-checks**" — the mechanism prints **30** (`grep -c "fence fixture:"` →
    30; the fixture holds 30 cases), and the same report's §8 says 30 case-checks + 1 = 31 fixture-block
    checks, with 185 total re-measured green. Report prose contradicts itself; the mechanism is right.
  - scripts/guards/factory-guard.mjs:1690-1692 — [FALSE CLAIM, wording] "an opener indented four columns
    or more is an indented code block, **exactly as the reference reads it**" is true at top level and
    false inside a list item — the reference derives a fenced block there (list continuation; both
    references agree, measured) while the scanner reads nothing. The OUTCOME (not read) is declared by
    three instruments; the JUSTIFICATION sentence lacks its "at the top level" qualifier. Same class as
    round 6's falsified pricing sentence, but it hides nothing — the boundary stands declared elsewhere;
    the signature it admits is named in Q4-A.
  - scripts/guards/factory-guard.mjs:483-485 + scripts/guards/lib-sibling-guard.sh:44 +
    docs/agents/borrowed-guards.md — [MECHANISM, standing hole] Q3's machine-unreached `scripts/lib`:
    no rule reads those headers, the sibling rule does not span the directory, and the borrowed-guards
    registry has no entry for the first vendored module. One rule line closes it; this diff did not
    create the hole (it inherited and documented half of it).
  - My own measurement artifact, recorded for honesty: my first 17-shape probe printed a phantom
    divergence on `​```md\n✓ …\n` — the trailing split-piece of the last line-ending, a blank by
    construction. The fuzz's skip-blank convention and the rule's `matchAll` both ignore it; not a
    divergence and not a finding.

## Every load-bearing number of the round, re-measured this turn

- Wide fuzz (`/tmp/xf/wfuzz.mjs`, oracle = real commonmark): post-swap **0/160 000** on all 8 runs;
  pre-swap wide-LF 10 359 / 2 227 / 9 603 — reproduced exactly.
- Re-derivation: **30 cases, 0 disagreements, byte-identical** with the committed fixture; sha256
  `1fd15786e41f12d6b47fab54c185e778e4c76ac512edb936610c1cc1b1520530` matches the report.
- `node scripts/guards/factory-guard.check.mjs` — **all 185 checks passed** (30 fixture case-checks
  counted by name); `bash scripts/guards/run-all.sh` — **GUARDS: PASS** in the checkout; lib-sibling 8/8;
  trailing-newline 10/10.
- Repo run: **702 fenced block(s) read, 10 range summaries checked; 8 recorded sites, 7 of the 8
  ABSORBED, LOST COVERAGE 1; 671 of 671 bare-head occurrences matched; PASS, exit 0** — §8's every
  number, byte-for-byte.
- The Risks section's honesty note is TRUE, now independently measured: a single-anchor
  normalisation-only scanner mutant **still fires** on the CRLF seed (opener still opens, block
  over-reads, exit 1); only the two-anchor restoration of the old end-anchored recogniser flips the
  verdict — exactly as the mutation is written in the committed checker.
- The two committed end-to-end POST-swap seeds (CRLF composite, P0 opener) assert the flips and run green
  inside the 185; the PRE-swap end-to-end signatures quoted in §3 match the pre-swap fuzz/round-6 record.
- Not re-run by this lane, as in every round: `npm run`'s unit/e2e suite (71 files / 2063 tests / AGENTS.md
  1789-of-1800) — those numbers stand as the round's own record, unverified here.
- Provenance/scope of the rung commit (`8de09eb`) verified: 6 files, all in-lane (the report + the two
  guard files + derive + fixture + the new scanner); no dependency added (`package.json`/lock untouched;
  no markdown parser in node_modules); the quotation baseline's +3 sites are exactly the
  `slice-8b-verify-6.md` re-derivation, disclosed, D-033 procedure (map blanked → sites read back).

## THE INSTRUMENT QUESTION — CLOSE. Do not delete.

Straight answer: **the rule earned its keep, and it should be kept.**

1. **The cost curve broke at the rung.** Rounds 1-6 were not maintenance of this rule; they were the
   batch discovering that hand-writing a markdown recognizer is the defect, punctuated by prose repairs
   of sentences that priced the parser's misbehaviour. The rung replaced the defective component with the
   reference's own clauses plus a machine-pinned conformance fixture. What remains is self-verifying: a
   fixture that re-derives byte-identically from the authority, a mutation-anchored seed pair per shape,
   and a fuzz oracle that is a different implementation. Marginal cost going forward is ~zero. The eight
   rounds are sunk cost, not recurring cost.
2. **The class it watches is live, not historical.** It fired for real at its origin, and it surfaced
   four MORE true positives this round — the `slice-8b-verify-6.md` quotations, which that report must
   carry to prove the rule fires. This workflow recreates the class every round it runs: lane reports
   quoting probe seeds. Deleting the rule abandons the one watch over an artifact class the batch
   produces by construction.
3. **The residual is declared and priced.** The escape that remains (container/HTML boundaries) is
   declared in the instrument's headers once the one blocking sentence lands, is latent on the corpus
   (measured: 0 container-fenced lines, 0 HTML-tag report files, 26 508-line parity), and cannot be
   widened away by any future edit without a fixture failure. Deleting the rule does not remove those
   boundaries — it removes the watch.
4. **The honest cost of keeping:** the guard's green is coupled to untracked lane-report bytes via the
   quotation baseline (8 sites, size printed every run; edits print `LOST COVERAGE N` truthfully or
   fire) — the one recurring nuisance, disclosed in Risks. If a future round finds THIS coupling
   churn-worthy, that round should re-derive the baseline the documented way, not delete the rule.

## Recommended next action

Add the one HTML-over-read ceiling sentence (the round's only required change), record the close ruling
and the `scripts/lib` provenance/sibling hole in the next decisions/ledger entries, then mark the rule
closed: **kept, rung held, no eighth divergence, no delete.**
