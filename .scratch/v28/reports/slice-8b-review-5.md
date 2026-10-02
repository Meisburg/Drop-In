# Slice 8b — fresh-context review, ROUND 5 (the independent lane, again)

    Verdict: NEEDS_CHANGES

This is my second round on this lane; I found the fifth shape (the loose closer). I re-ran everything in this
turn against `HEAD` (`341c0bb`); the fix is `4ebdcf8` plus the two lane-report provenance commits. No repo file
was edited; all probes ran in /tmp on surgery copies of the guard and throwaway roots.

**The one-line answer to the brief's only question: the fix CLOSED the two faces of the fifth shape I named —
a same-kind closer with an info string, and any-length — and the quotation absorber is a REAL re-derivation,
verified with my own surgery runs; but the parser is still CommonMark-shaped, not CommonMark: the CLOSER's
leading-whitespace/indentation rule (CommonMark: the closing fence is preceded by at most three spaces) is
unimplemented, and the same D-031/D-032 signature (`0 … compared`, `NOTHING was compared`, PASS, exit 0) is
STILL constructible — the shape moved to the closure's whitespace dimension rather than ending. Plus two
"LOST COVERAGE 0" sentences that the instrument's own print contradicts.**

## Blocking findings

  - scripts/guards/factory-guard.mjs:1788-1793 — [SIXTH SHAPE / UNDER-DECLARED BOUNDARY + FALSE CLAIM, same
    fence-closure family] the CLOSER branch carries no indentation rule. `:1788 const marker =
    /^\s*(`{3,}|~{3,})(.*)$/` accepts ANY leading whitespace for opener AND closer, and `:1796 } else if (kind
    === open.kind && run.length >= open.length && info.trim() === '') {` closes on it. CommonMark closes only
    on a closing fence "optionally preceded by up to three spaces" — at four (or a tab) the line is CONTENT and
    the block continues to the next legal closer. `marked` 18.0.14 (the round's own ground truth):
    lexing "```md / harmless / `    ``` ` / ✓ line / ```" yields exactly ONE code token spanning all seven
    lines — the ✓ line is INSIDE the block. The guard closes early and DROPS it. Measured end-to-end:

        input (P1b):  file zz-raw.md = "```md\nharmless\n    ```\n✓ 7–13 zz-spec.e2e.ts (all six legs)\n"
        $ node scripts/guards/factory-guard.mjs --root /tmp/reo/b-p1b --repo .
          note — transcript-summary-agrees: 1 fenced block(s) read, 0 range summaries checked — NOTHING was compared: …
          PASS … EXIT=0

      — the identical `… 0 range summaries checked — NOTHING was compared`, PASS, exit-0 signature D-031/D-032
      exist for, reachable BY CONTENT. Three more measured members of the same dimension: P1 (same with a
      trailing bare closer: "2 fenced block(s) read, 0 range summaries checked", exit 0), P2 (leading TAB:
      exit 0), P3 (trailing TAB on a bare closer "```\t": exit 0 — marked keeps CONTENT there too; the
      `info.trim()` also accepts any tab/`\v`/`\f`/NBSP-suffixed closer, where marked closes only on spaces),
      and the 4-space-indented TILDE closer (same). The falsified claims, by line:
        * :91-95 (header) "read, by CommonMark's own fence rules" and "a same-kind line closes it only when
          its run is at least as long and carries nothing but whitespace" — the latter states the closer rule
          with no indentation limit, so the sentence and the spec disagree exactly at P1b;
        * :1639-1647 (docblock) "read by CommonMark's own closure rules";
        * :1770 "THE FENCE RULES ARE COMMONMARK'S, implemented rather than guessed at" and :1782 "This is
          conformance to a closed specification, not a fourth condition on a guess";
        * :1772 "(after leading whitespace — ANY amount, the declared safe over-read…)" — declared for the
          OPENER, where the direction is genuinely safe (recognizing more fences read MORE). The regex is
          shared; on the CLOSER the same leniency UNDER-reads (it ends blocks early and drops content
          CommonMark keeps) — the word "safe" is false on this input;
        * ceiling :1668-1671 "an indented fence marker IS a fence and its block IS read — over-reading is the
          safe direction, and tightening … `^ {0,3}` would open … a four-space-indented fence around a
          fabricated transcript" — true of the OPENER; the SAME four-space-indented marker in the CLOSER
          position produces the escape under the CURRENT (loose) regex. The shape is in NEITHER ceiling bullet.
      NOT live on the corpus: a full-scan parity pass (guard parser loop lifted verbatim vs `marked`.lexer,
      all 161 scanned .md) reads `agree 4 / guard-misses 0 / 51 in declared non-fence shapes (tables, spans,
      indented code)` — every ✓-pair line marked puts in a fenced block IS read. So this is the fifth shape's
      position one round ago: latent, reachable by construction. The round's own ladder bullet predicted the
      rung (slice-8b.md:1325-1327: "if a future reviewer finds a fence shape the guard reads differently from
      CommonMark, the rung is the reference implementation, not a fifth condition") — this is that finding, at
      that rung, with input + command.

  - scripts/guards/factory-guard.mjs:1739 and .scratch/v28/reports/slice-8b.md:1218-1219 — [WRONG NUMBER /
    FALSE CLAIM] both say the quotation baseline's coverage clause prints "LOST COVERAGE 0" on the live
    corpus; it prints LOST COVERAGE 1 and can never print 0. Measured now:

        $ node scripts/guards/factory-guard.mjs …
          note — transcript-summary-agrees: quotation baseline holds 4 recorded site(s) … — 3 of the 4 ABSORBED
          this scan (LOST COVERAGE 1)

      Mechanism-impossible to reach 0: the :193 line's first pair (`✓ 1–6 … (all six legs)`) is CORRECT
      arithmetic (span 6 = six), and the counter increments per PAIR while `absorbed` only counts FAILING
      baseline pairs (:1813-1860; the docblock :1866-1867 already declares "absorbed FINDINGS, not matched
      sites: a line whose arithmetic had become correct would return before the count and read as lost
      coverage"). The count 2 is FORCED, not chosen — measured: recording 1 fires the genuine :193 site
      (surgery run, /tmp/reo/guard-count1.mjs) — so the ABSORBER is legitimate and the defect is exactly the
      two LOST-COVERAGE-0 sentences (D-028: delete them or make the print/record units agree). Side effect
      worth naming: with a standing background of 1, the print can no longer distinguish today's healthy state
      from a future loss of exactly one failing occurrence — D-033's "shrinking the record is visible rather
      than silent" degrades by one unit. The honest repairs are small and either direction works: make the
      recorded/printed unit the FAILING pair (record 1, print reaches 0, the second-line boundary still fires
      — verified by the count-1 run), or state the standing 1 in the map comment and the report sentence.

## Non-blocking findings

  - scripts/guards/factory-guard.check.mjs:1470-1499 — the fifth-shape seed covers only the info-string closer
    variant (the nested ` ```js ` idiom). The LENGTH face of the fifth shape (a shorter same-run closer
    closing a longer opener) has NO seed of its own; a partial reversion that kept the info-string fix but
    dropped the length comparison would keep the harness green. The parser implements length and it survives
    marked-parity (measured: 4-run closing a 3-opener closes in both; 4-space-indented content apart) — this
    is harness supervision, not a live defect.
  - The 20B claim-gate checks are exemplary of the form the family asked for: both halves per gate, and the
    gate mutation asserted on MUTANT OUTPUT (exit 0 + claim printed), with the exit-immutability of a claim
    gate named as the reason (check.mjs:817-887). No finding.
  - 341c0bb's provenance edits are true: measured at e2c18b2 and c4a981d, the checker is 137 checks with
    exactly 136 ✓ + 1 ✗ (check 13, independence-satisfiable); at 7c16e7a it is 137/137 green; at HEAD 146/146
    green and the gate is exit 0. My own report's two edited lines now say what I measured (the red was at
    e2c18b2, HEAD had moved on by commit time).

## The clean parts, stated plainly (the brief asked me to earn them)

  - THE FIFTH SHAPE'S SUBSTANCE IS CLOSED. Both content variants I shipped in round 4 now fire (A: nested
    ```md/```js idiom — exit 1 "covers 7 entries"; B: same-kind info-string closer — exit 1). The parser now
    implements: opener ≥3 of one char; backtick opener's info string may not contain a backtick (verified
    conformant, not over-restrictive: tilde info with backticks still opens, matching marked); closer = same
    kind, run ≥ opener length, whitespace-only suffix; unclosed fence reads to EOF (:1801 — matching
    CommonMark's extension to EOF; measured); the other-kind fence inside an open block is content (fires —
    conformant); blockquotes/mid-line/other-glyph stay in the declared ceiling, re-measured at HEAD (c1: not
    read, D-030 finding — declared; c2/c3/f: read, firing). Corpus parity 4/4 agree, 0 missed fenced ✓-lines.
  - THE ABSORBER IS A REAL RE-DERIVATION. Three surgery runs: (1) blanked map → exactly the three sites
    (slice-8a-verify-5.md:37, slice-8b-review.md:89, slice-8b-review.md:193) + the D-030 empty-record finding —
    byte-compatible with the committed map's keys; (2) third entry removed → :193 fires with exactly the
    recorded key text; (3) count 1 → the real site fires, proving the recorded 2 is forced by the pair
    semantics. The site text is an inline code-span QUOTATION of a bad seed inside the round-1 review's prose
    (committed at 1de1905, before round 5 existed — no lane report was edited to create the absorption). The
    newly-read region is genuine CommonMark (the `~~~text` region carries info strings, none of which close it;
    marked agrees the region runs to EOF). Not a hand-added silencer; NOT the D-027-forbidden widening.
  - CHECK 13 IS A FIXTURE NOW, LOUDLY COUPLED. check.mjs:321-354: the one-qualified world is BUILT by reducing
    the live registry (strongest qualifier kept by capability total, other qualifiers deleted), throwing loudly
    if the live registry ever holds <2 qualifiers, and the control (same world WITH the acknowledgement, exit
    0) fails loudly if the reduction would strand another floor. The D-034 break (a registry change silently
    invalidating the seed's premise) is gone: registering more qualifiers still reduces to exactly one;
    removing them crashes the seed rather than passing vacuously. The remaining coupling to live data is
    declared in the check's own comment and loud in both directions. Robust.
  - THE CLAIM GATES ARE THE SHARED FORM, NOT A THIRD `IF`. :1935-1936 now gate on `provenanceTokens` /
    `transcriptsCompared`, adjacent to and identical in shape with :1937's `if (rawSummaryLines)` — count +
    truthy `if`, with truth-in-form seed/control/mutation for each (20B). Nothing stopped being watched: the
    claim classes publish over measured scans only; at a true zero the claim is correctly absent, which is the
    form D-030's fix established last round.
  - FIX 4 (lib-sibling), the sentence deletion, is in the diff verbatim and its checker still passes 8/8; the
    guard is green at HEAD (the 8 D-036 findings were cured by the lanes' own edits, "8 findings -> 0"
    reproduced: exit 0).

## Requirements traceability (the brief's audit list)

  - Did the fix close the shape I found, or move it? -> CLOSED on the info-string and length faces (measured,
    both variants fire, parser verified against marked on every face I shipped plus the boundary matrix), and
    MOVED on the closure's whitespace dimension — sixth shape, blocking finding 1, input + command named.
  - Is the parser CommonMark or CommonMark-shaped? -> CommonMark on kind, length, closer-suffix emptiness,
    opener-info restriction, unclosed-to-EOF, other-kind-content, and ON THE LIVE CORPUS (0 divergent ✓-lines
    over 161 files). CommonMark-shaped on the closer's leading-whitespace (>3 spaces / tab closing where the
    spec keeps content) and on suffix whitespace KINDS (trim accepts where marked requires spaces).
  - The absorber: re-derivation or silencer? -> re-derivation (three surgery runs above); the two "LOST
    COVERAGE 0" sentences are the silencers' shadow — false claims, blocking finding 2.
  - The three rewritten sentences (header :91-99, docblock :1639-1647, parser comment :1770-1782)? -> each now
    states the implemented rules and survives every measured shape EXCEPT the closer-whitespace input, where
    "by CommonMark's own fence rules" / "COMMONMARK'S, implemented rather than guessed at" / "conformance to a
    closed specification" are falsified; the "safe over-read" wording (:1671, :1772) is false on the closer
    side. D-028's option set: implement the rule (sentences survive) or narrow the sentences to the
    implemented subset and declare the closure-indent exception in the ceiling. A FIFTH prose-only repair of
    the same sentence, with the parser still accepting the input, would be a ladder finding.
  - The two claim gates: same shared form or a third hand-written if? -> same shared form (counts, truthy-if,
    identical to rawSummaryLines; verified in code and by 20B's six checks including output-anchored mutants).
  - Check 13's seed robust? -> fixture world built by reduction with two loud failure modes and a control;
    robust to the D-034 registration break that made it red.
  - The standing hunts: D-025 — the falsified conformance sentences are above. D-030 — nothing stopped being
    watched: the fix's new reads are absorbed; the claims gate on measurement; the baselines' sizes print;
    the one-qualified world is synthetic. The sixth shape IS the "which set did I stop watching" answer for
    this round: the closer's whitespace, which the CommonMark claim had promised and the parser does not keep.

## Commands run this turn (all reproduced, none flaky)

  - `node scripts/guards/factory-guard.mjs --root . --repo .` → exit 0; 689 blocks / 6 ranges checked; "3 of the
    4 ABSORBED (LOST COVERAGE 1)"; 671/671 bare-head occurrences matched.
  - `node /tmp/reo/guard-blank.mjs …` (quotation map blanked) → exit 1; exactly 3 sites (:37, :89, :193) + the
    D-030 empty-record finding.
  - `node /tmp/reo/guard-no3.mjs …` (third entry removed) → :193 fires with the recorded key text.
  - `node /tmp/reo/guard-count1.mjs …` (count 2 → 1) → :193 fires; proves count 2 is forced.
  - `node scripts/guards/factory-guard.check.mjs` → 146/146 green, exit 0 (was 1/137 failed at e2c18b2/c4a981d,
    137/137 green at 7c16e7a — measured via detached worktrees).
  - `node scripts/guards/lib-sibling-guard.check.mjs` → 8/8 green, exit 0.
  - marked 18.0.14 lexer probes on P1/P1b/P2/P3/NBSP/tilde/length inputs (block extents quoted in findings).
  - Full-corpus parity (guard parser vs marked.lexer, 161 .md files): agree 4 / guard-misses 0 / 51 declared
    non-fence; the round-4 divergence (slice-8b-review.md ~:91-104) is gone.

## Honest limits

  - `cmark` (the canonical reference renderer) is not available offline; my conformance oracle is `marked` 18
    (the same arbiter the fix used) + the CommonMark 0.30 spec text. The leading-indent boundary (>3 spaces on
    a closer) is solid under both; the trailing-tab suffix case rests on marked + the spec's "optionally
    followed by spaces" wording — I marked it as a member of the same dimension, not as a load-bearing stand.
  - I did not re-run `npm run verify`'s unit/e2e suite (out of my lane); I read the round-5 RAW VERIFY block and
    spot-verified its checker/guard claims, all of which measured true.

**DISCLOSURE: I am the independent lane (the reviewer of record for the fifth shape), re-running this turn with
fresh measurements; every load-bearing number above was produced by a command in this turn. The builder's
round-5 report was an input; where it is right I say so plainly (the substance of the fifth shape, the
absorber, check 13, the claim gates), and where it claims a number the instrument contradicts I cite the
command that shows it (LOST COVERAGE 0).**

