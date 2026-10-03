# Slice 8b — VERIFICATION, ROUND 8 (FINAL, fresh context)

**Status: FAIL**

Working dir `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, tip `baa8cff` (this round's own change is
`0f86aa9`; `baa8cff` only persists the four round-6/7 lane reports). Every probe ran against a **throwaway git
clone under `/tmp/v8`** (`git clone` of the worktree at `baa8cff`; `git ls-files` diffed against the repo = **947 =
947, identical tracked set**; `node_modules` symlinked; `scripts/install-git-hooks.sh` run inside the clone so the
no-bypass guard is meaningful there). The reference implementations are the installed `/tmp/mdref`
(`commonmark` **0.31.2**, `marked` **18.0.14**, versions read from their `package.json`, not assumed). No inference
server was started or stopped, nothing was pushed, no lane report was edited. The only file written inside the repo
is this report.

Read first, as instructed: the FINAL ROUND section of `.scratch/v28/reports/slice-8b.md`, `factory/decisions.md`
D-037 / D-039 (and D-032 / D-038 for the rung), and `docs/agents/borrowed-guards.md`.

**Items 1, 2, 3, 4, 5 and 7 reproduce.** **Item 6 does NOT:** the new CEILING sentence declares the HTML boundary an
over-read that "can only ADD a read", and a **constructible input falsifies that** — the same missing HTML state
produces an **UNDER-read** that drops a reference-fenced fabricated line and leaves the guard green. That is the
exact `NOTHING was compared` signature the sentence says the boundary cannot produce. Details in §6a.

## 1. `npm run verify` — exit 0, every builder number re-measured

| quantity | builder claimed | re-measured | agree |
|---|---|---|---|
| exit code | 0 | **0** | yes |
| Test Files | 71 | **71** (`Test Files  71 passed (71)`) | yes |
| Tests | 2063 | **2063** (`Tests  2063 passed (2063)`) | yes |
| lint warnings (`grep -c ": warning "`) | 81 | **81** | yes |
| lint errors (`grep -c ": error "`) | 0 | **0** | yes |
| AGENTS.md | 1789 vs ceiling 1800 | **1789** (`ok — AGENTS.md (1789 words, ceiling 1800)`) | yes |
| guards | PASS | **`GUARDS: PASS — all deterministic rules hold.`** | yes |

Raw, from the run (indented so this report does not enter the scan set it is about):

    $ (cd /tmp/v8/repo && npm run verify)
     Test Files  71 passed (71)
          Tests  2063 passed (2063)
      ok — AGENTS.md (1789 words, ceiling 1800)
    PASS — steering layer is clean.
    factory-guard check: all 185 checks passed.
    ===========================================================
    GUARDS: PASS — all deterministic rules hold.
    VERIFY EXIT=0
    $ grep -c ": warning " verify.log   -> 81
    $ grep -c ": error "   verify.log   -> 0

## 2. The three guard counts, each counted independently

    $ node scripts/guards/factory-guard.check.mjs ; echo EXIT=$?
    factory-guard check: all 185 checks passed.            EXIT=0   (185 ✓ lines)
    $ node scripts/guards/lib-sibling-guard.check.mjs ; echo EXIT=$?
    PASS — all 13 checks: the guard fires on every seeded defect and only on them.   EXIT=0   (13 ✓ lines)
    $ bash scripts/guards/lib-sibling-guard.sh ; echo EXIT=$?
      ok — all 57 non-exempt module(s) have a sibling test
    PASS — build law holds.                                EXIT=0

- **185, and the arithmetic reaches it.** `factory-guard.check.mjs` has **146** textual `check(` occurrences; **2**
  are not calls (a string literal at `:1284`, the final `console.error` at `:2053`) → **144** calls. **5** sit inside
  loops: 1 in `separators` (**4** members), 1 in `sweepShapes` (**6**), 2 in `emptyRecords` (**3** rows), 1 in
  `for (const c of fixture.cases)` (**30** verified from `fence-conformance.fixture.json`). Expansion
  `4+6+3+3+30 = 46`; `144 − 5 + 46 =` **185**. Yes.
- **13, and the arithmetic reaches it.** The lib-sibling checker has **13** `check(` occurrences, all at line start,
  **none in a loop**, so the output has 13 ✓ and every one is a direct call. Yes.
- **57, and the arithmetic reaches it.** Enumerated the scan sets directly over the tree:
  `src/lib/*.ts` non-test, non-exempt = **55** (125 .ts files − 67 `*.test.ts` − 3 exempt); `src/lib/*.mjs` =
  **1** (`escapeForRegExp.mjs`, has its `.test.ts`); `scripts/lib/*.mjs` = **1** (`sweep-e2e.mjs`, has its
  `.check.mjs`; `fence-scanner.mjs` is exempt). `55 + 1 + 1 =` **57**. 55 → 57 is exactly `escapeForRegExp.mjs`
  and `sweep-e2e.mjs`, as the builder says.

## 3. The widening diff — is it "a moved block, not a rewrite of the loop's logic"?

`git diff --numstat 0f86aa9^ 0f86aa9 -- scripts/guards/lib-sibling-guard.sh` = **87 insertions + 57 deletions =
144** churn lines, matching the disclosed number. The churn is: the EXEMPT block physically moved from below the
missing-directory check to above `scan_set` (delete + re-add with its comment), plus the inline loop → helper.

The **functional delta is small and I can name all of it**; the *detection* branch is semantically unchanged:

| element | old | new | functional? |
|---|---|---|---|
| loop | inline `for "$LIB_DIR"/*.ts` | `scan_set <dir> <mod> <sibling>` | parameterised, not moved logic |
| glob | `"$LIB_DIR"/*.ts` | `"$dir"/*"$mod"` | parameterised |
| skip set | `*.test.ts` | `*.test.ts|*.check.mjs|*.d.mts|*.d.ts` | **widened** (required by the new reach) |
| exempt key | `basename` (`types.ts`) | full path (`src/lib/types.ts`) | needed for two dirs |
| existence test | `[ ! -f "$LIB_DIR/$base.test.ts" ]` | `[ ! -f "$dir/$base$sibling" ]` | same test, parameterised |
| `checked`/`FAIL=1` | identical | identical | no |
| calls | 1 glob | 3 `scan_set` calls | **the point** |
| messages | `.test.ts`-named | generic | text only |

So: **the detection logic did not move; the loop was wrapped and parameterised, the skip set widened, the exempt
keys made path-scoped, and three calls added.** The builder's framing ("a small change with a moved block") is
fair, with one precision: the functional delta is the **three calls + the shared helper + the widened skip set +
path-scoped exemptions**, not *only* the three calls. No behavioural line is a rewrite of the pair-matching
branch.

## 4. Did the widening weaken anything? Both halves reproduced.

Re-ran the **pre-widening** guard (`git show 7811a18:scripts/guards/lib-sibling-guard.sh`) and the HEAD guard over
throwaway roots. Previously-covered behaviour is **exit-code identical**:

| root | OLD exit | NEW exit |
|---|---|---|
| `src/App.tsx` only (missing `src/lib`) | 1 (`does not exist`) | **1** (`does not exist`) |
| `src/lib/types.ts` only (D-030 empty scan) | 1 (`scan read nothing`) | **1** (`scan read nothing`) |
| `src/lib/types.ts` + real pair (exemption honored) | 0 | **0** |

New reach, both halves (real guard, throwaway roots):

    $ bash scripts/guards/lib-sibling-guard.sh /tmp/v8/roots/mjs
      MISSING: src/lib/plain.mjs has no src/lib/plain.test.ts
      FINDING: 1 module(s) ship no sibling test.      FAIL   EXIT=1
    $ bash scripts/guards/lib-sibling-guard.sh /tmp/v8/roots/scripts
      MISSING: scripts/lib/orphan.mjs has no scripts/lib/orphan.check.mjs
      FINDING: 1 module(s) ship no sibling test.      FAIL   EXIT=1

Neutering the rule lets them pass (mutants built by dropping the corresponding `scan_set` line):

    $ bash /tmp/v8/mut-nosrcmjs.sh  /tmp/v8/roots/mjs      -> ok — all 1 non-exempt module(s) have a sibling test  EXIT=0
    $ bash /tmp/v8/mut-noscripts.sh /tmp/v8/roots/scripts -> ok — all 1 non-exempt module(s) have a sibling test  EXIT=0

Control (the `scripts/lib` `*.check.mjs` convention is honored, not always-red): a `scripts/lib/ok.mjs` with its
`ok.check.mjs` gives `ok — all 2 non-exempt module(s) have a sibling test`, EXIT=0. **No weakening found.**

## 5. The exemption — its stated reason is TRUE, and it is reviewable, not a hole.

`scripts/lib/fence-scanner.mjs` is exempted on the written ground that its behaviour test is
`factory-guard.check.mjs`'s fixture block. **That is true, and I broke it to prove it.** The checker imports the
module (`factory-guard.check.mjs:27  import { scanFences } from '../lib/fence-scanner.mjs'`) and its fixture loop
(`:1959-1965`) runs `scanFences(c.source)` over all 30 reference-derived cases. In a throwaway copy I changed the
scanner's tab-column rule (`column += 4 - (column % 4)` → `column += 1`) — an edit that touches **none** of the
checker's mutation anchors — and re-ran the checker:

    $ node factory-guard.check.mjs      # scanner mutated
      ✗ fence fixture: tab-indented closer stays content — guard [[1,2],[5,5]] vs reference [[1,4]]
      ✗ the guard's own parser diverges from the reference on NO case in the table — 1 divergence(s)
    factory-guard check: 2 check(s) failed — the factory guard is not doing its job.   EXIT=1

The fixture block fails when the scanner's behaviour changes → it **is** the module's behaviour test. The exemption
is **visible** (in the EXEMPT list), **named** (`scripts/lib/fence-scanner.mjs`), **reasoned** (a written block
naming the fixture and the one-copy rule), and its reason is **true**. Not a hole.
Residual (named, not fatal): the reason is prose — nothing machine-checks that the named test still exists, so the
exemption could outlive its justification without a red gate. That is the general property of the EXEMPT list.

## 6a. The ceiling sentence — CONFIRMED FALSE. This is the FAIL.

The bullet names the over-read (yes) but claims the mechanism supports a safety property it does not:

    - a fence marker INSIDE an HTML block is ALSO read: the scanner carries no
      HTML state, so a marker a raw HTML block swallows is opened as a fence
      where both references derive none. It is an OVER-read by construction — it
      can only ADD a read, so it cannot produce the `NOTHING was compared`
      signature this rule exists to close (D-037 §3);

**A constructible input makes it an UNDER-read.** Because the spurious opener has no HTML state to stop it, the
next real **bare** fence opener is consumed as its closer, shifting the block boundary past a reference-fenced
fabricated line:

    <div class=x>          <- HTML block starts (type 6), ends at a blank line
    ```md                  <- inside HTML: reference opens NOTHING; scanner OPENS a fence here
    raw html line 1
    raw html line 2
                           <- blank line ends the HTML block
    ```                    <- reference OPENS the real fence; scanner CLOSES its spurious fence on it
    ✓ 7–13 zz-spec.e2e.ts (all six legs)   <- reference: inside the fence; scanner: inside NO block
    ```                    <- reference closes; scanner OPENS an empty block

Both references read the fabricated line as fenced content; the scanner drops it:

    $ node /tmp/v8/html/probe2.mjs /tmp/v8/html/cascade.md
    commonmark FENCED (info defined): [{ "info": "", "literal": "✓ 7–13 zz-spec.e2e.ts (all six legs)\n",
                                         "sourcepos": [[6,1],[8,3]] }]
    marked tokens: [ {"type":"html", ...}, {"type":"space", ...},
                     {"type":"code", "raw":"```\n✓ 7–13 zz-spec.e2e.ts (all six legs)\n```\n"} ]
    $ node /tmp/v8/html/probe3.mjs /tmp/v8/html/cascade.md
    cascade.md -> scanner blocks [[2,5],[8,9]]        # non-blank line index 6 (the ✓) is in NEITHER

End-to-end, on the real binaries, both halves:

    # (A) the builder's over-read seed — a marker in HTML with NO later real opener:
    #     references derive 0 fenced blocks; the scanner reads the ✓ line (over-read) — the guard FIRES, as declared.
    $ node scripts/guards/factory-guard.mjs            # root = clone + zzA-overread.md
      note — transcript-summary-agrees: 703 fenced block(s) read, 11 range summaries checked
      FINDING [transcript-summary-agrees]: .scratch/v28/reports/zzA-overread.md:3: a fenced block's summary line
              covers 7 entries (7–13) but states "(all six" — ...                          FAIL  EXIT=1

    # (B) the CASCADE — same HTML over-read, but a real opener follows:
    #     both references read the ✓ line fenced; the scanner DROPS it; the rule says NOTHING was compared.
    $ node scripts/guards/factory-guard.mjs            # root = clone + zzB-cascade.md
      note — transcript-summary-agrees: 704 fenced block(s) read, 10 range summaries checked      # +2 blocks, +0 summaries
      PASS — the registry can be trusted and no work item claims evidence it does not have.       exit 0, 0 findings

    # the same file alone (root with no other report) prints the signature verbatim:
    $ node scripts/guards/factory-guard.mjs --root /tmp/v8/html-root --repo /tmp/v8/repo
      note — transcript-summary-agrees: 2 fenced block(s) read, 0 range summaries checked —
              NOTHING was compared: no fenced block in this scan states a step range beside its count

So the boundary the sentence calls "OVER-read by construction" is, for a constructible input, **an UNDER-read that
produces the `NOTHING was compared` signature** — the class D-037 §3 exists to exclude from the stop condition and
the class the whole rule exists to close. Per D-037 §4 latency does not exempt. **No test in the round covers this
shape**: the checker's only "HTML" seed (`:1630`) is an HTML *comment* separator (`<!-- … -->`, terminated on the
same line), and the conformance fixture carries fence cases only.

## 6b. The provenance entry — PASS. Its two unestablished facts are stated AS unestablished.

`docs/agents/borrowed-guards.md` gained the CommonMark entry. It states, explicitly, rather than filling in:

> - The scanner's **provenance header is not machine-checked**: the instrument-header rule reads
>   `scripts/guards/*.mjs` one level deep, and this module is under `scripts/lib/`. Its BEHAVIOUR is machine-checked
>   (the fixture above); the prose about where it came from is not.
> - It ships **no sibling test of its own** … The lib-sibling guard now scans `scripts/lib/` (slice 8b) and carries a
>   written exemption for this module that names that test …

Both are true as stated: `factory-guard.mjs:135` scopes the header scan to `scripts/guards/*.mjs` ONE level, and
`grep` shows `scripts/lib/fence-scanner.mjs` imports nothing at all. Versions match the installed
(commonmark 0.31.2 / marked 18.0.14), the "what was taken / refused" clauses match `lib/blocks.js`, and the four
required tests are named. The "What was taken" table row for `lib-sibling-guard.sh` is updated to the reach §4
measured. No fact was invented.

## 7. Guard on the tree — PASS, 0 findings; none of the four lane reports is flagged.

    $ (cd /tmp/v8/repo && node scripts/guards/factory-guard.mjs)   # tip baa8cff, all four reports committed
      note — transcript-summary-agrees: 702 fenced block(s) read, 10 range summaries checked
      note — transcript-summary-agrees: ... LOST COVERAGE 1
      note — no-bare-head-count: 671 of the 671 recorded occurrence(s) matched this scan (LOST COVERAGE 0)
      ok — 6 model(s), 8 task kind(s), 6 work item(s); ... every step-range-and-count line read inside a fenced
           block agrees with its own count ...
    PASS — the registry can be trusted ...
    EXIT=0 ; grep -c FINDING -> 0

The four persisted lane reports (`slice-8b-{verify,review}-{6,7}.md`) produced **no** finding. Nothing was edited.

## Findings

1. **BLOCKER — the CEILING over-read sentence is false; the HTML boundary is an UNDER-read (§6a).** A report with a
   fence marker inside a raw HTML block, followed by a real bare opener, makes the scanner consume the real opener
   as the spurious fence's closer and drop a reference-fenced fabricated `✓ … (all N)` line. Both references read
   the line fenced (commonmark block sourcepos 6–8; marked `code` token); the real guard reads it in **no** block,
   prints `0 range summaries checked — NOTHING was compared`, and stays **green** (exit 0, 0 findings) on an
   otherwise-passing registry. The sentence at `scripts/guards/factory-guard.mjs:1702-1706` asserts this cannot
   happen. It can. Per D-037 §3/§4 this is the signature that must not exist, and per D-039's hard limit it is an
   under-read **after** the rung.
   File:line: `scripts/guards/factory-guard.mjs:1702` (the new bullet); the dropped line is the seed
   `.scratch/v28/reports/zzB-cascade.md:7` (my throwaway clone has no copy in this tree).

2. **Named, non-blocking — the exemption's justification is prose.** The `scripts/lib/fence-scanner.mjs` EXEMPT
   reason is true (§5) but not machine-checked; the guard checks file existence only. If the named fixture block
   were gutted, the exemption would outlive its reason silently. Consistent with the rest of the EXEMPT list;
   reported so it is not mistaken for a closed loop.

## Residual risks

- **Finding 1 is a rule-level decision, not a patch.** It is an under-read after the rung, which is exactly what
  D-039's hard limit reserves for the orchestrator (delete-and-record or a further structural answer). I do not
  patch, and I did not edit the guard.
- I did not attempt the wide fuzz or a live smoke lane this round; both were cleared in round 7 and are unchanged
  by `0f86aa9` (that commit adds 5 comment lines, 144 churn lines to `lib-sibling-guard.sh` + 47 to its checker, 75
  to the doc). The scanner bytes are untouched by `0f86aa9`, so round 7's scanner-conformance result still holds.
- The clone reproduced the tracked set exactly (947 = 947) and ran the tracked git hooks; a difference from a
  directly-run `npm run verify` in the worktree would be environmental, not code.

## Return format

    Status: FAIL
    Commands:
      - npm run verify                                      -> PASS (exit 0)
      - node scripts/guards/factory-guard.check.mjs         -> PASS (exit 0, 185)
      - node scripts/guards/lib-sibling-guard.check.mjs     -> PASS (exit 0, 13)
      - bash scripts/guards/lib-sibling-guard.sh            -> PASS (exit 0, 57)
      - node scripts/guards/factory-guard.mjs               -> PASS (exit 0, 0 findings)
      - (falsification) cascade seed + real references      -> FAIL (scanner drops a reference-fenced line; guard green)
    Failure excerpts:
      - commonmark FENCED: [{"info":"","literal":"✓ 7–13 zz-spec.e2e.ts (all six legs)\n","sourcepos":[[6,1],[8,3]]}]
        marked tokens: [..., {"type":"code","raw":"```\n✓ 7–13 zz-spec.e2e.ts (all six legs)\n```\n"}]
        scanner read set: [[2,5],[8,9]]  — the ✓ line (index 6) is in NEITHER
        guard: "2 fenced block(s) read, 0 range summaries checked — NOTHING was compared"  (standalone)
        guard on a passing registry: 704 blocks / 10 summaries, PASS, exit 0, 0 findings
    Notes: Items 1-5 and 7 PASS with independent arithmetic. Item 6b PASSES. Item 6a FAILS: the new
           CEILING sentence's "can only ADD a read" is falsified by a constructible input, which is an
           under-read producing the very signature it denies.
