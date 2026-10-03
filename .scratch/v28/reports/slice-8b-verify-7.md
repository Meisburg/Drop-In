# Slice 8b — VERIFICATION, ROUND 7 (fresh context)

**VERIFY: PASS**

Working tree `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, tip `8f9d105` (the rung itself is
`8de09eb`; `8f9d105` only appends the report/ledger). Every probe ran read-only on the repo: the pre-swap
guard bytes came out with `git show 5bdbe05:scripts/guards/factory-guard.mjs`, every throwaway root,
harness and mutant lives under `/tmp/v7`, and the reference implementations are the ones already installed
at `/tmp/mdref` (`commonmark 0.31.2`, `marked 18.0.14` — versions read from their `package.json`, not
assumed). No inference server was started or stopped, nothing was pushed, no lane report was edited. The
only file written inside the repo is this report.

Read first, as instructed: the TAKE THE RUNG section of `.scratch/v28/reports/slice-8b.md`, my lane's own
`slice-8b-verify-6.md` (the opener over-read FAIL and the all-indents fuzz), and `factory/decisions.md`
D-032 / D-037 / D-038 / D-039.

**Every headline claim reproduces.** The three findings below are real and measured; none of them is a
failed claim, and none of them is an unpatched divergence of the scanner. Verdict is PASS because that is
what the commands and the re-measurements say.

## 1. `npm run verify` — exit 0, every builder number re-measured

| quantity | builder claimed | re-measured | agree |
|---|---|---|---|
| exit code | 0 | **0** | yes |
| Test Files | 71 | **71** (`Test Files  71 passed (71)`; independent `find` over the tree = **71**) | yes |
| Tests | 2063 | **2063** (`Tests  2063 passed (2063)`) | yes |
| lint warnings (`grep -c ": warning "`) | 81 | **81** | yes |
| lint errors (`grep -c ": error "`) | 0 | **0** | yes |
| AGENTS.md | 1789 vs ceiling 1800 | **1789** (`wc -w AGENTS.md` = 1789; the lint prints `ok — AGENTS.md (1789 words, ceiling 1800)`) | yes |
| guards | PASS | **`GUARDS: PASS — all deterministic rules hold.`** | yes |

Raw, from the run (indented, so this report does not enter the very scan set it is about):

    $ npm run verify
    > drop-in@0.0.0 verify
    > npm run build && npm run test && npm run lint && npm run a11y:focus && npm run steering-lint && npm run guards
     Test Files  71 passed (71)
          Tests  2063 passed (2063)
    e2e/dm.e2e.ts:24:15: warning eslint(no-unused-vars): Type 'Page' is imported but never used. ...
    src/components/SessionProvider.tsx:25:17: warning react(only-export-components): ...
      ok — AGENTS.md (1789 words, ceiling 1800)
    PASS — steering layer is clean.
    factory-guard check: all 185 checks passed.
    ===========================================================
    GUARDS: PASS — all deterministic rules hold.
    VERIFY EXIT=0

## 2. `node scripts/guards/factory-guard.check.mjs` — exit 0, **185**, and the arithmetic reaches it

    $ node scripts/guards/factory-guard.check.mjs ; echo CHECKER_EXIT=$?
    factory-guard check: all 185 checks passed.
    CHECKER_EXIT=0
    $ grep -c "✓" <checker output>          -> 185
    $ grep -c "✓ fence fixture:" <output>   -> 30

I counted independently, the way round 6 did:

- **144** statements in `factory-guard.check.mjs` begin with `check(` (the two other textual matches are a
  string literal at `:1284` and the final `console.error` at `:2053` — not calls).
- **5** of the 144 sit inside loops: 1 in `separators` (**4** members), 1 in `sweepShapes` (**6**), 2 in
  `emptyRecords` (**3** rows), 1 in `for (const c of fixture.cases)` (**30**).
- Expansion `4 + 6 + 3 + 3 + 30 = 46`; `144 − 5 + 46 =` **185**.

**Yes — the arithmetic reaches 185.** Over round 6's 178 that is +7, matching the builder's own
decomposition: +4 line-ending fixture cases, +1 the shared-scanner check, +1 the CRLF seed, +1 its
mutation. The fixture block alone contributes **31**: 30 case-checks plus the non-empty-table guard.

## 3. THE WIDE FUZZ — re-run. The pre-swap number reproduces; the post-swap zero reproduces.

I wrote my own harness (`/tmp/v7/fuzz.mjs`) — same design as the one the two lanes used (LCG seed `t+1`,
20 000 inputs per run, per-line "is this line inside a fenced block" membership against `commonmark`, blank
lines skipped) so that the numbers are comparable. The pre-swap parser is **lifted by anchors from the
committed bytes at `5bdbe05`** (`git show 5bdbe05:scripts/guards/factory-guard.mjs`), not from a copy; the
post-swap side imports `scripts/lib/fence-scanner.mjs` directly. The pre-swap side reproduces the pre-swap
guard's own read (`text.split('\n')`, guard line `1767` at that commit).

| run (20 000 inputs) | PRE-SWAP diverging | PRE-SWAP UNDER | PRE-SWAP OVER | POST-SWAP diverging | POST UNDER | POST OVER |
|---|---|---|---|---|---|---|
| closure-only, LF | 0 | 0 | 0 | **0** | 0 | 0 |
| closure-only, CRLF | 17211 | 17211 | 0 | **0** | 0 | 0 |
| closure-only, bare CR | 17211 | 17211 | 0 | **0** | 0 | 0 |
| all-indents, LF | **10359** | **2227** | **9603** | **0** | 0 | 0 |
| all-indents, CRLF | 14855 | 14855 | 0 | **0** | 0 | 0 |
| all-indents, bare CR | 14855 | 14855 | 0 | **0** | 0 | 0 |
| all-indents, MIXED endings | 15398 | 11649 | 6068 | **0** | 0 | 0 |
| closure-only, MIXED endings | 15619 | 13875 | 3763 | **0** | 0 | 0 |

- **The before number is reproduced exactly: 10 359 diverging / 2 227 UNDER / 9 603 OVER on the all-indents
  LF run at `5bdbe05`.** That is the same triple `.scratch/v28/reports/slice-8b-verify-6.md` §3b published
  for the current parser, so the "before" this slice claims to beat is a before I measured, not a quoted one.
- **The after number is zero on all eight runs: 160 000 inputs, 0 diverging, 0 UNDER, 0 OVER.**
- The closure-only LF row is **0 both before and after**, exactly as the builder says: the closure family was
  already closed, and what the rung removed is the OPENERS' contribution, where every one of the pre-swap
  under-reads lives.
- Extra evidence that the seventh shape was real: in a CRLF scan the pre-swap parser drops fences on
  **17 211 of 20 000 closure-only inputs** — the `no fence recognised at all` failure, measured.

## 4. End-to-end on the real binaries, both shapes — both halves reproduce

Throwaway roots: one clean LF report and the seeded file. The post-swap side is the **repo's own**
`scripts/guards/factory-guard.mjs`; the pre-swap side is `git show 5bdbe05:scripts/guards/factory-guard.mjs`.

    # (b) the P0 / indented-opener over-read seed (LF), root = the seed alone
    $ node /tmp/v7/old-guard-5bdbe05.mjs --root <p0-root> --repo .
      note — transcript-summary-agrees: 2 fenced block(s) read, 0 range summaries checked — NOTHING was compared ...
    PASS — the registry can be trusted and no work item claims evidence it does not have.
    EXIT=0

    $ node scripts/guards/factory-guard.mjs --root <p0-root> --repo .
      note — transcript-summary-agrees: 1 fenced block(s) read, 1 range summary checked
      FINDING [transcript-summary-agrees]: .scratch/v28/reports/zz-p0.md:5: a fenced block's summary line
              covers 7 entries (7–13) but states "(all six" — a captured transcript must reproduce its own arithmetic
    FAIL — 1 factory finding(s).
    EXIT=1

    # (a) the CRLF shape (fence written with CRLF line endings), root = one fence-only LF report + the seed
    $ node /tmp/v7/old-guard-5bdbe05.mjs --root <crlf-root> --repo .
      note — transcript-summary-agrees: 1 fenced block(s) read, 0 range summaries checked — NOTHING was compared ...
    PASS — the registry can be trusted and no work item claims evidence it does not have.
    EXIT=0

    $ node scripts/guards/factory-guard.mjs --root <crlf-root> --repo .
      note — transcript-summary-agrees: 2 fenced block(s) read, 1 range summary checked
      FINDING [transcript-summary-agrees]: .scratch/v28/reports/zz-crlf.md:5: ... covers 7 entries (7–13) but states "(all six" ...
    FAIL — 1 factory finding(s).
    EXIT=1

Both halves, both shapes, on the real binary: `exit 0, 0 compared, PASS` before, `exit 1 + FINDING` after.
One root-shape note, because it took a second construction to see it: the CRLF shape needs the **composite**
root. With the CRLF seed *alone* the pre-swap parser reads zero blocks and the D-030 empty-set tripwire
fires, so the pre-swap exit is 1 for a different reason. That is the builder's "in a mixed scan the tripwire
stays silent" read, and it is correct.

## 5. AUDIT OF THE SCANNER — the fresh surface

### 5a. Direct probes on inputs the fixture does NOT contain — no non-blank-line disagreement

`/tmp/v7/probe2.mjs` and `/tmp/v7/exotic.mjs` compare, per input, the scanner's block boundaries with
`commonmark 0.31.2`'s. The families the task named, plus exotica (each run both with and without a trailing
newline):

| family | scanner vs commonmark |
|---|---|
| nested same-kind fences at 0 / 3 / 4 spaces, and a longer inner run | agree on every non-blank line |
| info string with a backtick (backtick opener refused) | agree |
| info string with a backtick on a TILDE opener (still opens) | agree |
| unclosed fence at EOF | agree on every non-blank line; boundary differs by one EMPTY line (see below) |
| CRLF inside a fence body; LF opener + CRLF closer; bare CR; mixed | agree |
| fence opened at 3 spaces, closed at 0 | agree |
| tilde fences mixed with backtick fences (`~~~` closed by ` ``` ` is content, and vice versa) | agree |
| very long runs (``````````` vs ```) | agree |
| closer with trailing spaces / tab / vertical-tab / NBSP / trailing text | agree with commonmark (`tab` is the declared reference-vs-reference disagreement, not a guard divergence) |
| U+2028 / U+2029 after a fence run, NUL in an info string, NUL/form-feed after a closer, 20-backtick runs | agree |
| indented opener (4 spaces, tab, 3 spaces + tab) then a bare same-kind line | agree — the reference reads the indented line as indented code, and so does the scanner |

**No input was found where the scanner and the reference disagree on the classification of any non-blank
line.** That is a negative result, so I strengthened it with an independent adversarial fuzz rather than
resting on a hand-picked list.

**Independent adversarial fuzz** (`/tmp/v7/afuzz.js`): a **different generator** from the reported one
(xorshift32 with a different seed mix, not the `t+1` LCG), a **broader alphabet** (runs of 3–8 backticks and
3–6 tildes, 15 indent forms including `\t\t` and `   \t`, 17 info/suffix forms including `` ` ``, `\v`, NBSP,
and tab variants, plus content lines that themselves look like fences), 1–12 lines, and LF / CRLF / bare-CR
endings chosen per line:

    300 000 inputs -> NON-BLANK-LINE divergences: 0

**The harness is not vacuous**: the same generator and the same comparison, run against the pre-swap
hand-written parser, reports **21 490 of 30 000** inputs diverging. So the generator reaches the divergence
space, and the new scanner has none of it.

**The one measured boundary difference, and it is inert.** For an UNCLOSED fence in text that ends with a
line ending, the scanner's `end` is `lines.length`, one past the reference's block end. `lines` is the
normalised split, so that extra line is always the empty string after the final newline. Over the 300 000
adversarial inputs, **135 392** inputs have a boundary-tuple difference and **every single one** is exactly
"one extra trailing empty line on an unclosed block" — a classifier for that shape found **0** inputs of any
other kind, and **0** inputs where a non-blank line's classification differs. An empty line cannot carry a
step range or a count, so the guard's read set is unaffected. It is also not new: the pre-swap parser had
the same `end: lines.length`. I am reporting it because the task asked for any disagreement at all; I judge
it **not** an eighth shape, and it is not a reason to delete under D-039.

### 5b. `lib-sibling-guard` does NOT reach `scripts/lib/` — and the new module evades it

`scripts/guards/lib-sibling-guard.sh` hard-codes `LIB_DIR="src/lib"` and globs `"$LIB_DIR"/*.ts`. Measured on
a throwaway root holding three test-less modules:

    $ bash scripts/guards/lib-sibling-guard.sh /tmp/v7/lsib
      MISSING: src/lib/mod.ts has no src/lib/mod.test.ts
      FINDING: 1 module(s) ship no sibling test.
    FAIL — build law violated.                                  EXIT=1
    # the other two, named in the same root, were NOT reported:
    #   src/lib/module-mjs.mjs        (a lib/ module, no sibling test)   -> invisible
    #   scripts/lib/fence-scanner.mjs (a lib/ module, no sibling test)   -> invisible

So the new module evades the sibling-test rule on **two** axes at once: the directory (`scripts/lib`, not
`src/lib`) and the extension (`.mjs`, not `.ts`). One directory over it would still have escaped —
`src/lib/fence-scanner.mjs` is not scanned either, which is a pre-existing hole (`src/lib/escapeForRegExp.mjs`
is invisible to the guard too, though it does happen to carry `escapeForRegExp.test.ts`). Had the module been
`src/lib/fence-scanner.ts`, the guard would have caught its missing sibling.

That is a finding, not a technicality: the scanner ships **no** `fence-scanner.test.*` in any directory. It
is exercised — the fixture block in `factory-guard.check.mjs` runs it over the 30 reference cases, and the
e2e seeds drive the guard's use of it — so coverage exists in a non-sibling form. But the rule that would
have applied next door did not apply here, and nothing says so. **Reported for the orchestrator; not edited
(the guard is not this lane's to widen mid-verification).**

### 5c. "Uses the shared scanner" IS a text assertion — the disclosure is accurate, and the seeds catch only the seeded shapes

The check is one regex pair over the guard's source text
(`factory-guard.check.mjs:1900-1906`): it requires the import line `import { scanFences, splitLines } from
'../lib/fence-scanner.mjs'` AND the adjacent two lines `const lines = splitLines(text)` /
`const fenced = scanFences(text)`. The fixture block imports the **module** directly, so it pins the module,
never the guard's use of it. **The builder's disclosure is accurate.**

I built three single-call-site bypasses that keep the import and both asserted lines and read blocks with a
private parser instead (`/tmp/v7/x/b1.mjs`, `b2.mjs`, `b3.mjs`). All three pass the text assertion
(`import-assertion true, text-assertion true`). Running them on the seeds:

| bypass | what it reverts to | CRLF seed | P0 seed | crafted under-read root |
|---|---|---|---|---|
| real guard | — | exit 1 (caught) | exit 1 (caught) | exit 1 (caught) |
| **B1** the old hand-written recogniser | the historical defect (`text.split('\n')`, end-anchored marker) | **exit 0 — the seed catches it** | **exit 0 — the seed catches it** | — |
| **B2** a private scanner copy, closer suffix spaces-only (the tab-suffix case) | a shape **no seed exercises** | exit 1 — same as real, **not caught** | exit 1 — same as real, **not caught** | exit 1 — same as real, **not caught** |
| **B3** a private scanner copy, closer accepts ANY suffix | a shape **no seed exercises**, and it is an UNDER-read | exit 1 — **not caught** | exit 1 — **not caught** | **exit 0, `PASS`, "2 blocks, 0 summaries" — escaped** |

So: **the seeds really would catch a single-call-site bypass if it regresses on a shape a seed exercises**
(B1: the historical CRLF/opener defects — caught, twice). **They would not catch one that differs only on a
shape that lives in the fixture but not in any seed** (B2, B3). That is a narrower guarantee than "any
bypass", and it is the honest boundary of the disclosure. The shapes seeded *through the guard's use* are
the opener indent, the closer indent, the closer run length, the info-string face, the line-start face and
line-ending normalisation; the shapes that live only in the fixture (tab/vertical-tab/NBSP closer suffix,
unclosed-at-EOF, closer with trailing text) are pinned for the module, not for the call site.

## 6. Other builder numbers re-measured

    $ node scripts/guards/factory-guard.mjs
      note — transcript-summary-agrees: 702 fenced block(s) read, 10 range summaries checked
      note — transcript-summary-agrees: quotation baseline holds 8 recorded site(s) ... 7 of the 8 ABSORBED this scan (LOST COVERAGE 1)
      note — no-bare-head-count: 671 of the 671 recorded occurrence(s) matched this scan (LOST COVERAGE 0)
    PASS — the registry can be trusted and no work item claims evidence it does not have.
    EXIT=0

    $ MDREF=/tmp/mdref node scripts/guards/fence-conformance.derive.mjs
    30 case(s); 0 reference-vs-reference disagreement(s)                     EXIT=0
    $ diff <derived> scripts/guards/fence-conformance.fixture.json   -> no output (BYTE-IDENTICAL)
    $ sha256sum ... 1fd15786e41f12d6b47fab54c185e778e4c76ac512edb936610c1cc1b1520530   (both, matches the claim)

`scripts/lib/fence-scanner.mjs` has **no imports at all** (verified by grep) and `package.json` /
`package-lock.json` are untouched by the rung's commits. The 702 / 10 / LOST COVERAGE 1 / 8 recorded sites
all reproduce. The tree was re-run once more later (an unrelated lane's `slice-8b-review-7.md` had appeared
untracked while I worked) and the guard was still `PASS`, exit 0.

## Findings

1. **`scripts/lib/fence-scanner.mjs` evades `lib-sibling-guard`.** The guard is hard-coded to `src/lib/*.ts`
   and does not reach `scripts/lib/` (nor `src/lib/*.mjs`). The module ships no sibling test. Coverage
   exists indirectly (the 30-case fixture block, the e2e seeds), but the rule that would have applied one
   directory over did not, and nothing says so. Measured: §5b.
2. **D-039's provenance requirement is not met.** D-039 directs the scanner be "*vendored with provenance
   under `docs/agents/borrowed-guards.md`*". `docs/agents/borrowed-guards.md` contains **no** mention of the
   scanner, `commonmark`, or any fifth borrowed artifact (measured by grep). The provenance exists only in
   the module's own header — which the builder itself notes is *outside* the machine-checked
   instrument-header scan. The decision named the doc; the doc was not updated.
3. **The "uses the shared scanner" check is a text assertion whose seed protection is shape-limited** —
   disclosed, and now measured (§5c): a text-preserving single-call-site bypass is caught by the seeds only
   when it regresses on a shape a seed exercises. The fixture pins the module, not the call site.
4. **Unclosed-fence boundary differs from the reference by one trailing EMPTY line.** Inert for the rule's
   read set (measured over 300 000 adversarial inputs: 0 non-blank-line differences). Reported for
   completeness; not an eighth shape.

## Residual risks

- The scanner has **no** non-blank-line divergence from `commonmark 0.31.2` anywhere I could reach (160 000
  reported-corpus inputs + 300 000 independent adversarial inputs + the fixture's 30 cases). What I cannot
  reach: the declared ceilings the fixture and the module header already name — fence recognition inside
  blockquotes and lists (commonmark's container machinery was refused on purpose), and `marked`'s
  disagreement on the tab-suffixed closer. A divergence that needs containers is outside the instrument by
  declaration, not by oversight.
- `marked 18.0.14` disagrees with `commonmark 0.31.2` beyond the tab-suffix case: it treats a **tab-indented
  or 4-space-indented opener** as a fence where commonmark reads indented code. So marked is not a usable
  oracle for the indent rule, and the fixture's "both references agree" claim holds only for the 30
  committed cases; commonmark is the right authority.
- The guard's green depends on the current untracked lane reports not changing (`LOST COVERAGE 1` is
  truthful and non-gating; the quotation baseline is 8 sites). Another lane's report appeared mid-run and
  the gate stayed green, but that coupling is real and the builder flags it.
- Findings 1 and 2 are orchestrator decisions (widen/extend the guard; update the doc). Neither is a scanner
  divergence, so neither touches D-039's hard limit.
