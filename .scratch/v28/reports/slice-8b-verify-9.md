# Slice 8b — VERIFICATION, ROUND 9 (FINAL, narrow): the round-8 FAIL is closed

**Status: PASS**

Working dir `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, tip **281d69e** (the close-out commit
itself; its parent is `397cf42`). Every probe ran against a **throwaway git clone under `/tmp/v9/repo`**
(`git clone` of the worktree; `git ls-files` diffed against the repo = **949 = 949, identical tracked set**;
`node_modules` symlinked; `scripts/install-git-hooks.sh` run inside the clone). The references are the installed
`/tmp/mdref` (`commonmark` **0.31.2**, `marked` **18.0.14**, versions read from their own `package.json`, not
assumed). No inference server was started or stopped, nothing was pushed, and no lane report was edited. The only
file written inside the repo is this report.

The one outstanding FAIL was round 8's **Item 6a**: the CEILING bullet claimed the HTML over-read "can only ADD a
read, so it cannot produce the `NOTHING was compared` signature", and I falsified it with a phantom-fence cascade.
This round verifies the deletion and the replacement, and re-runs the falsifying construction to confirm the
behaviour is unchanged. It is.

## Item A — the false sentence is GONE, and the replacement is true

`git diff 397cf42 281d69e -- scripts/guards/factory-guard.mjs` = **2 insertions, 3 deletions** (net **−1** line);
it is the only bullet in the file touched (no neighbour reworded). The bullet now reads, in full:

    - a fence marker INSIDE an HTML block is ALSO read: the scanner carries no
      HTML state, so a marker a raw HTML block swallows is opened as a fence
      where both references derive none. A DECLARED boundary, not a covered
      shape — the guarantee stops here;

**It makes no claim about which signature it can produce.** `git grep` over every tracked non-report file for the
deleted wording (`can only ADD`, `OVER-read by construction`, `cannot produce the `NOTHING``) returns **only**
`.scratch/v28/reports/*.md` — the lane reports quoting the old sentence as the thing under test, and the close-out
quoting it as the thing being deleted. Nothing in `factory-guard.mjs`, its checker, or any other guard asserts the
direction. D-028 §4 (delete, do not explain; net prose shrinks) is met: −1 line, no sentence added to explain it.

Is the replacement TRUE? Two clauses, both measured:
- *"the scanner carries no HTML state"* — `scripts/lib/fence-scanner.mjs` has no HTML handling of any kind
  (read in full: `normalizeLineEndings`, `splitLines`, `scanFences`, three regexes; nothing inspects an HTML
  block).
- *"a marker a raw HTML block swallows is opened as a fence where both references derive none"* — measured below
  on both the round-8 seed and the cascade.
- *"A DECLARED boundary, not a covered shape — the guarantee stops here"* — true and honest.

### Re-running my own falsifying construction (behaviour unchanged)

The construction (indented; each `FENCE` stands for a triple-backtick marker, `FENCEmd` for one with `md`):

    <div class=x>                          raw HTML block (type 6), ends at the blank line
    FENCEmd                                inside the HTML: both references open NOTHING;
                                           no HTML state, so the scanner OPENS a fence here
    raw html line 1
    raw html line 2
                                           blank line ends the HTML block
    FENCE                                  reference OPENS the real fence; the scanner
                                           CLOSES its phantom fence on this line
    ✓ 7–13 zz-spec.e2e.ts (all six legs)   reference: inside the fence; scanner: in NO block
    FENCE                                  reference closes; scanner opens an empty block

Both references read the fabricated line as fenced content; the scanner drops it. Re-measured this turn against
the real binaries (my own probes, `/tmp/v9/html/`):

    $ node /tmp/v9/html/probe-ref.mjs /tmp/v9/html/cascade.md
    references: commonmark 0.31.2 | marked 18.0.14
    commonmark fenced code_block(s): [{"info":"","literal":"✓ 7–13 zz-spec.e2e.ts (all six legs)\n","sourcepos":[[6,1],[8,3]]}]
    marked token types: ["html","space","code"]
    marked code raw: "```\n✓ 7–13 zz-spec.e2e.ts (all six legs)\n```\n"

    $ node /tmp/v9/html/probe-scan.mjs /tmp/v9/html/cascade.md
    total lines: 9
     0 "<div class=x>"
     1 "```md"
     2 "raw html line 1"
     3 "raw html line 2"
     4 ""
     5 "```"
     6 "✓ 7–13 zz-spec.e2e.ts (all six legs)"
     7 "```"
     8 ""
    scanner blocks (0-based half-open [content,end)): [{"content":2,"end":5},{"content":8,"end":9}]
      non-blank line 5 in a block? false  "```"
      non-blank line 6 in a block? false  "✓ 7–13 zz-spec.e2e.ts (all six legs)"
      non-blank line 7 in a block? false  "```"

The `✓` line (0-based index 6) is in **neither** scanner block; commonmark reads it fenced (`sourcepos` 6–8) and
marked reads it as a `code` token. That is the `NOTHING was compared` signature the deleted sentence denied.

End-to-end on the real guard binary, both halves:

    # (A) the round-8 over-read seed alone — a marker in HTML with NO later real opener:
    #     references derive 0 fenced blocks; the scanner reads the ✓ line (over-read) — the guard FIRES, as declared.
    $ node scripts/guards/factory-guard.mjs --root /tmp/v9/over-root --repo /tmp/v9/repo
    note — transcript-summary-agrees: 1 fenced block(s) read, 1 range summary checked
    FINDING [transcript-summary-agrees]: .scratch/v28/reports/zzA-overread.md:3: a fenced block's summary line
            covers 7 entries (7–13) but states "(all six" — a captured transcript must reproduce its own arithmetic
    FAIL — 2 factory finding(s).        EXIT=1   (the other is config-exists, an artefact of the bare probe root)

    # (B) the CASCADE — same HTML over-read, a real opener follows:
    #     both references read the ✓ line fenced; the scanner DROPS it; the rule says NOTHING was compared.
    $ node scripts/guards/factory-guard.mjs            # clone root + zzB-cascade.md
    note — transcript-summary-agrees: 704 fenced block(s) read, 10 range summaries checked      # base 702/10, +2 blocks, +0 summaries
    PASS — the registry can be trusted and no work item claims evidence it does not have.       EXIT=0, 0 FINDING

    # the same file alone prints the signature verbatim:
    $ node scripts/guards/factory-guard.mjs --root /tmp/v9/html-root --repo /tmp/v9/repo
    note — transcript-summary-agrees: 2 fenced block(s) read, 0 range summaries checked — NOTHING was compared:
            no fenced block in this scan states a step range beside its count

**The behaviour is byte-for-byte what round 8 measured** — as it must be: the change is a comment. What changed is
that the artifact no longer asserts the boundary cannot do this. **Item A: PASS.**

## Item B — the D-030 emptiness check is PER SCAN SET again

The guard now carries one count per set (`checked` for `src/lib`, both its globs; `checked_scripts` for
`scripts/lib`; `scan_set` leaves its own count in `SET_COUNT`) and checks each set independently:

    if [ "$checked" -eq 0 ]; then
      echo "  FINDING: $LIB_DIR holds no non-exempt module — that scan set read nothing."
    ...
    if [ -d "$SCRIPTS_LIB_DIR" ] && [ "$checked_scripts" -eq 0 ]; then
      echo "  FINDING: $SCRIPTS_LIB_DIR holds no non-exempt module — that scan set read nothing."

Throwaway roots (`/tmp/v9/itemB/`), the real HEAD guard, seeds then mutations:

    # SEED A: hollow (exempt-only) src/lib beside a CLEAN, populated scripts/lib
    $ bash scripts/guards/lib-sibling-guard.sh /tmp/v9/itemB/A
      FINDING: src/lib holds no non-exempt module — that scan set read nothing.
    FAIL — build law violated.        EXIT=1

    # SEED C: the same with a TRULY EMPTY src/lib directory
    $ bash scripts/guards/lib-sibling-guard.sh /tmp/v9/itemB/C
      FINDING: src/lib holds no non-exempt module — that scan set read nothing.
    FAIL — build law violated.        EXIT=1

    # SEED B: the other arm — scripts/lib holding only the EXEMPT module
    $ bash scripts/guards/lib-sibling-guard.sh /tmp/v9/itemB/B
      FINDING: scripts/lib holds no non-exempt module — that scan set read nothing.
    FAIL — build law violated.        EXIT=1

    # MUTATION A: the src/lib set's own check dropped
    $ bash mut-srclib.sh /tmp/v9/itemB/A     -> ok — all 1 non-exempt module(s) have a sibling test  EXIT=0
    $ bash mut-srclib.sh /tmp/v9/itemB/C     -> ok — all 1 non-exempt module(s) have a sibling test  EXIT=0
    # MUTATION B: the scripts/lib set's own check dropped
    $ bash mut-scripts.sh /tmp/v9/itemB/B    -> ok — all 1 non-exempt module(s) have a sibling test  EXIT=0

Each seed's exit moves 1 → 0 under the mutation that removes that set's own check, so both branches are
load-bearing. The pre-widening guard at **`7811a18`** (the last reviewed-good form) agrees — it files the same
finding on A and C, and its own zero-check is load-bearing there too — so the fix **restores** rather than
invents:

    $ bash /tmp/v9/itemB/pre-widen-7811a18.sh /tmp/v9/itemB/A   -> FINDING: src/lib holds no non-exempt ... EXIT=1
    $ bash /tmp/v9/itemB/pre-widen-7811a18.sh /tmp/v9/itemB/C   -> FINDING: src/lib holds no non-exempt ... EXIT=1
    $ bash pre-widen-mut.sh /tmp/v9/itemB/A                     -> ok — all 0 non-exempt module(s) ... EXIT=0

(The pre-widening guard reads only `src/lib/*.ts`, so it is silent on root B by construction — that arm is the
**new** reach the widening added, not a restoration.)

Previously-covered behaviour is unchanged: missing `src/lib` → EXIT 1 (`does not exist`); an exempt entry plus a
real pair → EXIT 0. **Item B: PASS.**

## 3. `npm run verify` — exit 0

    $ (cd /tmp/v9/repo && npm run verify)      # VERIFY EXIT=0
     Test Files  71 passed (71)
          Tests  2063 passed (2063)
      ok — AGENTS.md (1789 words, ceiling 1800)
      factory-guard check: all 185 checks passed.
      GUARDS: PASS — all deterministic rules hold.
    $ grep -c ": warning " verify.log   -> 81
    $ grep -c ": error "   verify.log   -> 0

71 / 2063 / 81 / 0 / AGENTS.md 1789 vs ceiling 1800 / `GUARDS: PASS` — every builder number re-measured and
agreeing.

## 4. The two guard checkers, counted independently

- **`factory-guard.check.mjs` → 185.** Textual `check(` occurrences = **146**; **2** are not calls (a string
  literal at `:1284`, the final `console.error` at `:2053`) → **144** calls. **5** sit in loops: 1 in
  `separators` (**4** members), 1 in `sweepShapes` (**6**), 2 in `emptyRecords` (**3** rows), 1 in
  `for (const c of fixture.cases)` (**30** cases, verified from `fence-conformance.fixture.json`). Expansion
  `4+6+6+30 = 46`; `144 − 5 + 46 =` **185**. The run prints **185** `✓` lines. (This file is untouched by the
  close-out: `git diff --name-only 397cf42 281d69e` does not list it.)
- **`lib-sibling-guard.check.mjs` → 17 (was 13).** **17** `check(` occurrences, all at line start, **none in a
  loop**; the run prints **17** `✓` lines. The +4 are exactly Item B's two seeds and their two exit-moving
  mutations. Both `EXIT=0`.

## 5. The two guard binaries on the tree

    $ node scripts/guards/factory-guard.mjs
    note — transcript-summary-agrees: 702 fenced block(s) read, 10 range summaries checked
    note — no-bare-head-count: 671 of the 671 recorded occurrence(s) matched this scan (LOST COVERAGE 0)
    PASS — the registry can be trusted and no work item claims evidence it does not have.      EXIT=0, grep -c FINDING -> 0

    $ bash scripts/guards/lib-sibling-guard.sh
      ok — all 57 non-exempt module(s) have a sibling test
    PASS — build law holds.                                                                     EXIT=0

The 57 is re-derived independently: `src/lib/*.ts` non-test non-exempt = **55**; `src/lib/*.mjs` = **1**
(`escapeForRegExp.mjs`); `scripts/lib/*.mjs` = **1** (`sweep-e2e.mjs`; `fence-scanner.mjs` exempt). `55+1+1 =`
**57**.

## 6. The builder's two deliberate limits — both honestly declared

**Limit 1 — three globs, two sets.** The two `src/lib` globs share one directory and one sibling convention
(`<base>.test.ts`), so the tripwire counts them as one set; `scripts/lib` (`<base>.check.mjs`) is the other. This
is visible in the code (`scan_set "$LIB_DIR" ".ts" ".test.ts"`, `scan_set "$LIB_DIR" ".mjs" ".test.ts"`,
`scan_set "$SCRIPTS_LIB_DIR" ".mjs" ".check.mjs"`). Per-glob emptiness was rejected because it fires on a
legitimately empty extension subset. **The reasoning is sound, and it is demonstrated:** a root whose `src/lib`
holds only `plain.mjs` + `plain.test.ts` (no `.ts` module at all) passes today — the union read 1 module — where a
per-glob check on `src/lib/*.ts` would fire on an empty kind. That is a false positive: no module of that kind
exists to ship a sibling, while the measurement the rule exists to make (over the directory) did happen. D-030's
hazard is a measurement that *did not happen* read as health, which is the cross-set masking the per-set count
closes — not an absent extension subset.

    $ bash scripts/guards/lib-sibling-guard.sh /tmp/v9/itemB/D    # src/lib holds ONLY plain.mjs + plain.test.ts
      ok — all 1 non-exempt module(s) have a sibling test
    PASS — build law holds.        EXIT=0

**Limit 2 — a MISSING `scripts/lib` still has no finding of its own** (a present-but-empty one now does). Named in
the guard header ("`scripts/lib` is checked when that directory is present") and in the close-out Risks.
**Acceptable, not a hole — but a real, named residual.** Verified: a root with a clean `src/lib` pair and no
`scripts/lib` directory at all passes with no finding (EXIT=0). And the builder's stated *reason* is factually
true: making a missing `scripts/lib` a finding turns the checker's own clean-source seed red, because that seed's
root carries only `src/lib`:

    $ bash mut-missing-scripts.sh /tmp/v9/itemB/E     # the [ -d "$SCRIPTS_LIB_DIR" ] guard removed
      FINDING: scripts/lib holds no non-exempt module — that scan set read nothing.
    FAIL — build law violated.        EXIT=1   <- the checker's control seed would go RED under this rule

So it is honestly declared, and the counterfactual rule breaks the checker's controls (fixing it means giving
every checker seed a `scripts/lib`, a larger change). The residual — a deleted `scripts/lib` silently shrinks the
reach and the printed "all N" would drop with no finding — is exactly the "which set did I just stop watching?"
question D-030 asks, so it deserves to **stay named**. It is not closed, and the close-out says so.

## 7. Findings

**Zero.** A green `npm run verify` (71/2063/81/0/1789/`GUARDS: PASS`), `factory-guard.check.mjs` 185,
`lib-sibling-guard.check.mjs` 17, `factory-guard.mjs` PASS with 0 findings, `lib-sibling-guard.sh` EXIT 0 over 57
non-exempt modules, the round-8 falsification re-run and reproducing (behaviour unchanged), and both close-out
items verified: the false sentence is deleted and the replacement true; the emptiness tripwire is per set and
agrees with the pre-widening guard.

## Residual risks

- **Limit 2 above**: a missing `scripts/lib` remains unwatched, deliberately and in writing. A present-but-empty
  one is now a finding.
- The over-read/under-read HTML boundary remains **DECLARED**, not seeded. It is no longer mis-described: the
  bullet makes no direction claim.
- The scanner bytes are untouched by `281d69e` (comment-only for `factory-guard.mjs`); round 7's scanner
  conformance and round 8's fuzz result therefore still hold unchanged.

## Return format

    Status: PASS
    Commands:
      - npm run verify                                      -> PASS (exit 0)
      - node scripts/guards/factory-guard.check.mjs         -> PASS (exit 0, 185)
      - node scripts/guards/lib-sibling-guard.check.mjs     -> PASS (exit 0, 17)
      - bash scripts/guards/lib-sibling-guard.sh            -> PASS (exit 0, 57)
      - node scripts/guards/factory-guard.mjs               -> PASS (exit 0, 0 findings)
      - falsification cascade + real references             -> reproduced (scanner drops a reference-fenced line; guard green) — behaviour unchanged
    Failure excerpts:
      - none
    Notes: The round-8 FAIL is closed. The deleted sentence is gone from every tracked non-report file; the
           replacement declares the boundary and makes no direction claim. The emptiness tripwire is per scan
           set, both arms seeded with exit-moving mutations, and the pre-widening guard at 7811a18 agrees.
