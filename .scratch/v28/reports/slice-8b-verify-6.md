# Slice 8b — VERIFICATION, ROUND 6 (fresh context)

**VERIFY: FAIL**

Working tree `/home/jmeisburg/orca/workspaces/playdate-app/onboarding` (a linked worktree of
`/home/jmeisburg/Projects/playdate-app/onboarding`), tip `f1c6275`; the breaker repair is `47a5de3` and its
fixture shrink `7b69bf2` (the repair's own parser/checker/fixture bytes are unchanged at `f1c6275`, which only
appends `.scratch/v28/ledger.md`). `git status --porcelain` was empty before and after every probe; the only
file written inside the repo is this report. Every probe ran in a `/tmp` throwaway root or in a `git archive`
copy (`/tmp/tree-6`, made a live worktree by a `.git` gitdir pointer, read-only on the source). No inference
server was started or stopped and nothing was pushed.

Read first, as instructed: the BREAKER-ADJUDICATED REPAIR section of `.scratch/v28/reports/slice-8b.md`; my
lane's own round-5 report `slice-8b-verify-5.md` (the FAIL on the sixth shape); `factory/decisions.md` D-037
and D-038.

**The verdict is FAIL on ONE measured item, and it is the same class as round 5.** Every deterministic lane is
green and every mechanical claim the brief listed is reproduced below. The failing item is the instrument's
own declared ceiling: the repair reasserted as TRUE, in four places, that the guard's any-whitespace OPENER
over-read is "the safe direction — recognising more openers reads MORE". Measured, that is false in
composition. An over-indented (≥4-space or tab) OPENING marker can swallow the next LEGAL fence opener as its
closer, so the guard drops fenced content the reference reads — the exact `0 compared, PASS, exit 0` signature
D-031/D-032 exist for. It is constructible (seed below, reproduced end to end) and latent (the one live ≥4-space
marker carries a backtick in its info string and is skipped). Round 5 failed on the CLOSER's version of this
false-safety sentence; this repair corrected the closer's sentence and re-asserted the opener's, and the
opener's is the one the full-indent fuzz falsifies.

## 1. `npm run verify` — exit 0 (re-measured)

| quantity | builder claimed | **re-measured** | agree |
|---|---|---|---|
| exit code | 0 | **0** | yes |
| Test Files | 71 | **71** (`Test Files  71 passed (71)`; independent `find . -name '*.test.*'` (no node_modules) = **71**) | yes |
| Tests | 2063 | **2063** (`Tests  2063 passed (2063)`) | yes |
| lint warnings (`grep -c ": warning "`) | 81 | **81** | yes |
| lint errors (`grep -c ": error "`) | 0 | **0** | yes |
| AGENTS.md | 1789 vs ceiling 1800 | **`ok — AGENTS.md (1789 words, ceiling 1800)`** | yes |
| guards | PASS | **`GUARDS: PASS — all deterministic rules hold.`** | yes |

```
 Test Files  71 passed (71)
      Tests  2063 passed (2063)
  ok — AGENTS.md (1789 words, ceiling 1800)
PASS — steering layer is clean.
factory-guard check: all 178 checks passed.
GUARDS: PASS — all deterministic rules hold.
VERIFY EXIT=0
```

(The task brief wrote `find src e2e scripts -name '*.test.ts*'` = 71 in round 5; that glob is 68 today because
`scripts/*.test.mjs` are three of the 71. The total that vitest runs, by any correct glob, is 71 and it agrees
with `Test Files 71 passed`.)

## 2. `node scripts/guards/factory-guard.check.mjs` — exit 0, **178** (counted independently)

```
$ node scripts/guards/factory-guard.check.mjs ; echo CHECKER_EXIT=$?
factory-guard check: all 178 checks passed.
CHECKER_EXIT=0
$ grep -c "✓" <checker output>  -> 178
```

Independent arithmetic (static call sites + loop expansions), the way I counted 146 last round:

- **141** statements begin with `check(` (136 at two-space indent, 5 at four). The two other `check(` matches
  are a string literal at `:1266` and the final `console.error` at `:1982` — not calls.
- Of the 141, **5** sit inside loops: 1 in `separators` (4 members), 1 in `sweepShapes` (6 members), 2 in
  `emptyRecords` (3 rows), and 1 in the fixture loop `for (const c of fixture.cases)` (**26** cases).
- Expansion: `4 + 6 + 3 + 3 + 26 = 42`; replace the 5 in-loop call sites with it: `141 − 5 + 42 =` **178**.

The arithmetic reaches 178. The `+32` over round 5's 146 is the fixture block (26 cases + the non-empty-table
guard + the divergence summary = **28**, confirmed by `grep -c "✓ fence fixture:"` = 26 plus the two named
summaries) and the two new seed/mutation pairs (the closer-indent pair and the shorter-run pair).

## 3. THE SIXTH SHAPE — both halves reproduced, and the fuzz across all indents

### 3a. The exact 4-space-indented closer input, both halves

Seed (`/tmp/probe6/min`, a minimal root: `factory/config.json` + one report; the config finding otherwise masks
the exit code — see the note):

```
# zz 4-space-indented closer

```md
    ```
✓ 7–13 zz-spec.e2e.ts (all six legs)
```
```

Pre-fix (`git show f3cf360:scripts/guards/factory-guard.mjs` -> `/tmp/g-prefix6.mjs`):

```
  note — transcript-summary-agrees: 2 fenced block(s) read, 0 range summaries checked — NOTHING was compared: no fenced block in this scan states a step range beside its count
PASS — the registry can be trusted and no work item claims evidence it does not have.
EXIT=0
```

Post-fix (current tree, `/tmp/g-postfix6.mjs`):

```
  note — transcript-summary-agrees: 1 fenced block(s) read, 1 range summary checked
  FINDING [transcript-summary-agrees]: .scratch/v28/reports/zz-raw.md:5: a fenced block's summary line covers 7 entries (7–13) but states "(all six" — a captured transcript must reproduce its own arithmetic
FAIL — 1 factory finding(s).
EXIT=1
```

**Both halves reproduce exactly as claimed.** (In a root with no `factory/config.json`, a constant
`config-exists` finding makes both exits 1; the detection flip is then the +1 transcript finding, pre-fix 20
findings -> post-fix 21 on my minimal-plus-registry root. Reproduced with the config present so both exits are
literal.)

### 3b. The 20 000-input fuzz, run across ALL indents

I lifted the CURRENT guard's own parser by the checker's own anchors and compared its per-line "inside a fenced
block" verdict against `commonmark@0.31.2`, over the same kind of alphabet as round 5 but now admitting markers
at 0..8 spaces and tab indentation. Two harnesses, both 20 000 inputs, both seed `t+1`:

| run | inputs ≥1 divergence | UNDER-read inputs (escape dir) | OVER-read inputs | UNDER with NO over-read opener | OVER with NO over-read opener |
|---|---|---|---|---|---|
| **CURRENT, closure-only** (every MARKER line at a legal 0..3-space opener indent) | **0** | **0** | **0** | 0 | 0 |
| **CURRENT, all indents** (0..8 spaces + tabs on marker lines too) | 10359 | 2227 | 9603 | **0** | **0** |
| PRE-FIX f3cf360, closure-only | 2176 | 2176 | 429 | **857** | 0 |
| PRE-FIX f3cf360, all indents | 13007 | 6803 | 8824 | **1034** | 0 |

"Over-read opener" = a line the guard opened a fence on that CommonMark has no fenced block at (i.e. the
declared any-whitespace OPENER over-read fired). Every under-read input in the all-indents run is gated by one
(2227/2227); none survives when marker lines are held to a CommonMark-legal opener indent (0/20000).

**The number that decides the family:** the fence-CLOSURE family is closed — with legal openers and closers at
**any** indent, 20 000 inputs produce **0** divergences (pre-fix: 857 clean under-read inputs, the sixth shape
and its kin). What remains across all indents is the declared OPENER over-read, and it is not merely an
over-read: it can produce UNDER-reads (see the Finding).

### 3c. The over-read opener is an unsafe UNDER-read — constructible end to end

Seed (`/tmp/probe6/esc`), a 4-space-indented opening marker followed by a legal empty closer:

```
    ```
 ```
✓ 7–13 zz-spec.e2e.ts (all six legs)
```
```

Current guard (which is byte-identical to the pre-fix guard on this input):

```
  note — transcript-summary-agrees: 2 fenced block(s) read, 0 range summaries checked — NOTHING was compared: no fenced block in this scan states a step range beside its count
PASS — the registry can be trusted and no work item claims evidence it does not have.
EXIT=0
```

Same seed through `commonmark@0.31.2`: line 1 is an indented code block; line 2 opens a fenced block; the
fabricated `✓ 7–13 … (all six legs)` line is its **content** (`_isFenced: true`, literal that line). The guard
closed the over-read opener on line 2 and then opened a fresh fence on line 4, so the fabricated line is in no
parsed block. **This is a reference-fenced line the guard DROPS — the stop condition's own definition of a
divergence — and it is the `0 compared, PASS, exit 0` signature.** It is pre-existing (the pre-fix guard prints
the identical `2 … 0 … PASS` on this seed), and latent: `grep -rE "^ {4,}(\`{3,}|~{3,})"` over the scan set finds
exactly one line (`.scratch/v28/reports/slice-8b-review-5.md:101`), and that line's backtick opener has a backtick
in its info string, so the guard skips it and opens nothing. Zero live escapers today.

D-037 #3 says an over-read "must not trip the stop". The premise it was granted on — the sentence the repair
re-asserted, "recognising more openers reads MORE, which is the safe direction" (`factory-guard.mjs:1672-1673`,
and the parser comment `:1776`, and the docblock) — is what this seed falsifies: recognising one more opener
here reads LESS. Whether that makes this a seventh shape or a re-priced known-open is the orchestrator's call;
the measurement is reported either way.

## 4. AUDIT OF THE FIXTURE — the new instrument

### 4a. Reference-derived, not a transcription — byte-identical re-derivation

`MDREF=/tmp/mdref node scripts/guards/fence-conformance.derive.mjs` (references `commonmark@0.31.2`,
`marked@18.0.14`, the exact claimed versions) emits the committed table **byte-for-byte**:

```
26 case(s); 0 reference-vs-reference disagreement(s)
$ diff /tmp/derive-6.json scripts/guards/fence-conformance.fixture.json  -> no output
sha256 376160d5801f10a9065760593fc532cdd78740a1ba0f2f0adfdcc3437de6555b  (both files identical)
```

I also extracted the expected boundaries from commonmark with my own independent walker and from marked with my
own independent lexer, over all 26 cases:

```
fixture vs INDEPENDENT commonmark: 0 mismatch(es) of 26
fixture vs INDEPENDENT marked    : 0 disagreement(s) of 26
```

So the table's expectations are the reference's output (and exactly the 26 inputs on which the two references
agree), not typed from a reading of the spec.

### 4b. The table is strong enough to fail

In `/tmp/tree-6` (a full `git archive` of the tip, made a live worktree), baseline `all 178 checks passed`. I
corrupted the first case's expected boundary `[1,2] -> [0,1]`:

```
  ✗ fence fixture: simplest closed fence — guard [[1,2]] vs reference [[0,1]]
  ✗ the guard's own parser diverges from the reference on NO case in the table — 1 divergence(s)
factory-guard check: 2 check(s) failed — the factory guard is not doing its job.   EXIT=1
```

Restored (`sha256` back to `376160…`), the checker is green again. A table that cannot fail proves nothing;
this one fails loudly on a corrupted expectation.

### 4c. The anchor lift throws, it does not pass over nothing

`guardFenceParser()` slices the guard by two textual anchors and compiles with `new Function`. I moved each
anchor in a throwaway guard copy and ran the checker:

- start anchor (`"    const fenced = []"`) moved: `Error: the fence-parser anchors are not in factory-guard.mjs` — exit 1.
- end anchor (`"if (open) fenced.push({ content: open.at + 1, end: lines.length })"`) moved: the same throw — exit 1.

It cannot silently lift nothing and pass: if the lifted region returned an empty `fenced`, the 26-case table
would diverge on every non-empty case, and the block also asserts `fixture.cases.length > 0` (an empty table
is a D-030 finding). Both guard copies were restored (`sha256` matches the repo's).

### 4d. The dropped tab case — the references really disagree

Direct measurement on ` ```md\ncontent\n```\t\n✓ seven`:

| parser | fenced content | verdict on the trailing-TAB closer |
|---|---|---|
| `commonmark 0.31.2` (authority) | `content\n` (block ends line 3) | **CLOSES** |
| `marked 18.0.14` | keeps the ``` line inside the code text | **does NOT close** |
| guard (current) | `[[1,2]]` — **== commonmark** | **CLOSES** |

Trailing-space (both close), NBSP and vertical-tab (both keep as content) agree; only the tab suffix
disagrees. So per D-037 the case is genuinely an oracle disagreement and shrinking it out is faithful — and
the guard's own behaviour on it equals the authority's, so no divergence is hidden.

Does dropping it leave an untested region of real risk? A small, honest one, but not an unsafe one. The
fixture pins closure for trailing spaces (closes) and for NBSP/vtab (content), but nothing pins the trailing
TAB. If a future edit narrowed the closer suffix test from `[ \t]*` to spaces-only, the guard would stop closing
on a tab suffix — reading MORE, the declared safe direction, but no longer matching the authority on that one
input — and no case would catch it. There is no present divergence and no untested region in the UNSAFE
(under-read) direction; the gap is an unpinned suffix kind on which the guard currently follows the authority.

## 5. Guard re-run — PASS, 0 findings; `LOST COVERAGE` still honest

```
$ node scripts/guards/factory-guard.mjs        # the behavior lane, exit 0
  note — transcript-summary-agrees: 689 fenced block(s) read, 6 range summaries checked
  note — transcript-summary-agrees: quotation baseline holds 4 recorded site(s), re-derived and never hand-added; a NEW site, or a second occurrence of a recorded one in the same file, is a finding — 3 of the 4 ABSORBED this scan (LOST COVERAGE 1)
  note — no-bare-head-count: 671 of the 671 recorded occurrence(s) matched this scan (LOST COVERAGE 0)
PASS — the registry can be trusted and no work item claims evidence it does not have.
FINDING count: 0
```

`LOST COVERAGE 1` is the pre-existing derivation artifact (baseline `SIZE` counts pair-iterations, `ABSORBED`
counts firing pairs), unchanged and not gating; `LOST COVERAGE 0` on the bare-head baseline is truthful. No
finding appeared from this repair: the repair's own files add zero findings and every count above is measured
on the live tree. Repair 3's false comment is gone — `grep -n "LOST COVERAGE 0" scripts/guards/factory-guard.mjs`
returns nothing.

## Findings

1. **[FAIL, false safety claim + constructible under-read] The repair re-asserts that the OPENER's
   any-whitespace over-read "reads MORE, which is the safe direction" (`factory-guard.mjs:1672-1673`; the parser
   comment at `:1776`; the docblock).** The full-indent fuzz falsifies it in composition, and a constructible
   seed (`    ``` / ``` / ✓ 7–13 … (all six legs) / ``` `) makes the guard print `2 fenced block(s) read, 0
   range summaries checked — NOTHING was compared`, `PASS`, exit 0, while `commonmark@0.31.2` reads the
   fabricated line as fenced content. The over-read opener swallows the next legal opener as its closer and
   drops the reference-fenced line — the stop condition's definition of a divergence, in the unsafe direction.
2. **[INSTRUMENT, unpinned suffix kind]** The fixture deliberately omits the trailing-TAB closer (a genuine
   oracle disagreement, D-037), so the guard's trailing-tab closure — which matches the authority today — is
   not pinned by any case; a future narrowing to spaces-only would read MORE and go uncaught. No present
   divergence; no untested unsafe direction.

## Residual risks

- Finding 1 is latent only because no scan-set line currently opens a fence past three spaces (the one ≥4-space
  marker has a backtick in its info string and is skipped). D-037 #4 says latency does not exempt; any future
  report with an indented-code line beginning with a fence run, followed by a legal closer, reaches it.
- Whether Finding 1 is a seventh shape (stop -> D-032) or a re-priced known-open under D-037 #3 is an
  adjudication, not a measurement; the D-037 #3 exemption was granted on the "reads MORE" premise this
  measurement falsifies.
- The quotation baseline's `SIZE` over-counts firing sites by one, so `LOST COVERAGE 1` on the transcript rule
  is permanent and truthful (`size − absorbed`), not a healthy-state `0`.
