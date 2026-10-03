# Slice 8a — VERIFICATION, ROUND 4 (fresh verifier, round-3 fix at `7b72207`)

## DISCLOSURE (D-007 / D-015)

**I am a sibling model, not an independent instrument.** Fresh conversation, same family. What I did: ran every
command below myself and pasted what came back; extracted the real `codeOnly` out of
`src/lib/avatarUrl.test.ts` and diffed its output against `@babel/parser` 7.29.8 (already in `node_modules`);
ran the new guard rule against throwaway roots under `/tmp` (nine seed shapes, a mutation of the rule, five
controls, fourteen escape attempts); re-derived the bare-HEAD baseline by emptying the map in a throwaway copy
and parsing the findings back; and checked out `90c6e91` into `/tmp` to count the check harness before this
round. **What I did NOT do:** I did not start or stop any inference server, I did not push, I did not write to
the tree except this report, and I did not re-run the Playwright legs (the round changed no e2e file —
`git show --stat` of all three commits is in §1).

Range: the three round-3 commits are `1c24fcc` (the rule + seed/mutation/control + map), `6d22351` (the
`avatarUrl` ceiling), `7b72207` (the deleted block + the table row + the record). `git log --oneline -4`:

    output: (git log --oneline -4, run in the repo)
    7b72207 8a fix round 3: the fabricated `raw:` block DELETED, the table row repaired, and the round-3 record
    6d22351 8a fix round 3: the avatarUrl ceiling's sign fixed, and both false-pass vectors named with their measurements
    1c24fcc 8a fix round 3, BLK: a raw-labelled block must reproduce its own arithmetic (rule + seed + mutation), and the map absorbs the two round-3 lane reports
    90c6e91 8a: round 3 recorded; the standing rule moved into the always-loaded agent file; …

**VERDICT: VERIFY: PASS.** Every number in FR3-5 re-measured and every one matched. The new rule fires, its
mutation and control are real, and its own ceiling is honest about the *shape* — but three boundaries it does
not name are reachable (below), and one sentence of the ceiling states a limit the mechanism does not have.
All findings are non-blocking.

---

## 1. `npm run verify` — exit 0, every figure re-measured

    output: (npm run verify 2>&1, run myself at 7b72207)
    EXIT=0
     Test Files  71 passed (71)
          Tests  2063 passed (2063)
    warning lines=81 error lines=0
      ok — AGENTS.md (1789 words, ceiling 1800)
    PASS — steering layer is clean.
      note — no-bare-head-count: baseline holds 669 recorded occurrence(s)
      note — transcript-summary-agrees: 10 block(s) introduced as raw:/verbatim read, 0 range summaries checked — NOTHING was checked: no raw-labelled range summary exists in this scan
    GUARDS: PASS — all deterministic rules hold.

| figure | builder's FR3-5 claim | **I measured** | ruling |
|---|---|---|---|
| exit code | 0 | **0** | ✓ |
| test files | 71 | **71** (`Test Files 71 passed (71)`) | ✓ |
| tests | 2063 | **2063** (`Tests 2063 passed (2063)`) | ✓ |
| lint warnings (`grep -c ": warning "`) | 81 | **81** | ✓ |
| lint errors (`grep -c ": error "`) | 0 | **0** | ✓ |
| `AGENTS.md` words vs 1800 | 1789 | **1789 / 1800** (`ok — AGENTS.md (1789 words, ceiling 1800)`) | ✓ |
| GUARDS | PASS | **PASS — all deterministic rules hold.** | ✓ |
| test delta this round | ZERO (2063 → 2063) | **ZERO** | ✓ |

**The delta is independently grounded, not just equal-by-assertion.** `slice-8a-verify-3.md` records 2063 / 71
at `01930a7`, and the three round-3 commits touch only:

    output: (git show --stat --format="" <commit>, per commit)
    1c24fcc  scripts/guards/factory-guard.check.mjs | 41 +  / scripts/guards/factory-guard.mjs | 83 +-
    6d22351  src/lib/avatarUrl.test.ts | 34 +- (28 insertions, 6 deletions)
    7b72207  .scratch/v28/reports/slice-8a.md | 183 +- (171 insertions, 12 deletions)

`git show 1c30d6a:src/lib/avatarUrl.test.ts | grep -c "  it("` → **5**; `git show 7b72207:… | grep -c "  it("` →
**5**; `git diff 1c30d6a..7b72207 -- src/lib/avatarUrl.test.ts | grep -E '^[+-]' | grep -E 'it\(|expect\('` →
**no output** (the round-3 change to that file is its docblock, not its legs). And
`npx vitest run src/lib/avatarUrl.test.ts` → `Test Files 1 passed (1) / Tests 5 passed (5)`. No e2e file is in
the diff, so FR3-5's "no spec needed a re-run" holds.

---

## 2. The guard lanes — green twice, and the steering lint

`bash scripts/guards/run-all.sh` → **exit 0**, run **twice**, `GUARDS: PASS — all deterministic rules hold.`
both times. `bash scripts/steering-lint.sh` → **exit 0**, `PASS — steering layer is clean.` (25 files,
`AGENTS.md 1789/1800`, `coordinator.md 700/900`).

No lane report turned the guard red at this tree, so §2's "name the lane and stop" clause did not trigger. The
two round-3 lane reports are absorbed: the run reports `baseline holds 669 recorded occurrence(s)` and
`10 recorded unresolvable-sha record(s) absorbed`, and I re-derived both below (§7). **One live corpus move
happened mid-verification:** a sibling lane wrote `slice-8a-review-4.md` (untracked, 26 KB) after my first runs,
which lifted the rule's block count from 10 to **11** (`0 range summaries` on both sides, exit 0 on both sides);
every count below is stated at the moment it was measured.

---

## 3. `node scripts/guards/factory-guard.check.mjs` — exit 0, 93 checks, counted not read

    output: (node scripts/guards/factory-guard.check.mjs)
    EXIT=0
      ✓ a raw block's step range contradicting its own count is CAUGHT (transcript-summary-agrees)
      ✓ MUTATION: dropping the range/count agreement lets that seed PASS (so the check can fail)
      ✓ control: the same raw block with its count RIGHT passes (so the rule is not just a fence detector)
    factory-guard check: all 93 checks passed.

Counted independently rather than read off the summary: `grep -c "^  ✓"` on the run output → **93**, and
`grep -c "^  ✗"` → **0**. The three lines above are the round's delta, and they are the *only* delta: I
extracted `90c6e91` into `/tmp/old90` (`git archive | tar -x`, read-only) and ran *that* harness — pointing
its `--repo` at a real worktree via a symlink so the provenance checks can fire —

    output: (node /tmp/old90/scripts/guards/factory-guard.check.mjs, after ln -s <repo>/.git /tmp/old90/.git)
    factory-guard check: all 90 checks passed.   (90 ✓ lines, 0 ✗ lines)

So **90 → 93** reproduces exactly: one seed, one mutation, one control. (Without the `.git` symlink 8 of the 90
cannot fire — a `/tmp`-root artifact, not a prior-state claim — which is why the symlink is there.)

---

## 4. THE NEW RULE — `transcript-summary-agrees`, tested adversarially

The rule reads: inside a fence whose introducing line carries `raw:` or `verbatim`, a line matching
`✓ N–M` plus `(all <word|digit>` must have `M − N + 1` equal the stated count. Method: a throwaway root per
case (real `factory/config.json`, one clean work item, one report file), the **real** guard run with
`--root <tmp> --repo <repo>`.

### (a) The seed and the mutation — RE-DERIVED, not repeated

Seed = a file (`zz-probe.md`, planted in a /tmp root) whose content is a title line, then the label line the
rule reads (the word `raw` + a colon, spelled out in the escape table below), then one blank line, then a fence
holding exactly:

    Running 3 tests using 1 worker
    ✓ 7–13 zz-spec.e2e.ts (all six legs)

Run of the real guard against that root (`--root <tmp> --repo <repo>`):

    output: (node scripts/guards/factory-guard.mjs --root <tmp> --repo <repo>)
    exit=1
    note — transcript-summary-agrees: 1 block(s) introduced as raw:/verbatim read, 1 range summary checked
    FINDING [transcript-summary-agrees]: .scratch/v28/reports/zz-probe.md:7: a raw block's summary line covers 7 entries (7–13) but states "(all six" — a block claiming to be raw must reproduce its own arithmetic

It **fails, and names the file (`zz-probe.md`), the line (`:7`), the range (`7–13`) and the count (`7 entries …
"(all six"`)**. Then the rule itself, mutated in a throwaway copy at the one line that decides agreement —
`if (count === undefined || count === span) continue` → `if (true) continue` — against the **same** seed:
**exit 0** (the only difference from the seed run). So the seed's red is produced by the mechanism the check
names, and the check can fail. The harness's own anchor is the same string; I did not take its word for it.

**The real defect, replayed.** The rule's headline claim is that it fired on the *real* `:179` line before the
block was deleted. I materialised `git show 1c24fcc:.scratch/v28/reports/slice-8a.md` into a `/tmp` root and
ran the current guard over it: **exit 1**,
`FINDING [transcript-summary-agrees]: .scratch/v28/reports/slice-8a.md:179: … covers 7 entries (7–13) but states "(all six"`,
and `sed -n 179p` of that revision is exactly
`    ✓ 6 onboarding-resume.e2e.ts:136 … (2.8s)              ✓ 7–13 signup-zip-fallback.e2e.ts (all six legs)`.
My independent corpus scan (a plain script, not the guard's) over `git archive 1c24fcc` of
`reports/ + briefs/` → **11 labelled blocks, 1 range summary: `slice-8a.md:179 range 7-13 span=7 stated=six`** —
FR3-1's paste reproduces. At `7b72207` the same scan → **10 blocks, 0 range summaries**, matching the guard's
own note at this tree. The §3 block is gone (`sed -n 166,184p` shows the ⚠️ deletion note where it stood, and
the only remaining `raw:` hits in that file are prose).

### (b) The control is REAL — five controls, all green

| control seed | exit |
|---|---|
| `✓ 7–13 … (all seven legs)` (same block, count right) | **0** |
| `✓ 7–12 … (all six legs)` (same count, range right) | **0** |
| `✓ 7–13 … (all 7 legs)` (digit spelling) | **0** |
| `✓ 7–18 … (all twelve legs)` (word at the map's edge, agreeing) | **0** |
| the same range line **without** a `raw:` label | **0** (0 blocks read) |

A raw block whose count is right passes, so the rule is a check of agreement, not a fence detector.

### (c) ESCAPES — 14 near-misses, and which the docblock already named

| # | near-miss (seed body, span in brackets) | result | did the docblock say so? |
|---|---|---|---|
| 1 | `✓ 7-13 … (all six legs)` — ASCII hyphen | **CAUGHT** | control: the dash class is wider than the docblock's `–` |
| 2 | `✓ 7—13 … (all six legs)` — em-dash | **CAUGHT** | same |
| 3 | `✓ 7 - 13 … (all six legs)` — spaced hyphen | **CAUGHT** | same |
| 4 | `✓ 7–18 … (all 13 legs)` [span 12] — digits | **CAUGHT** | — |
| 5 | `✓ 7–18 … (all eleven legs)` [span 12] — word in the map | **CAUGHT** | — |
| 6 | `✓ 7–18 … (all thirteen legs)` [span 12] — **word above twelve** | **ESCAPES (exit 0)** | **NO — under-declared boundary** |
| 7 | `✓ 7–13 … (all of six legs)` — `all of <count>` | **ESCAPES** | the docblock's grammar is `all <count>`; not named literally |
| 8 | `✓ 7 through 13 … (all six legs)` | **ESCAPES** | named generically ("one shape … any other way escapes") |
| 9 | `✓ 7 to 13 … (all six legs)` | **ESCAPES** | same |
| 10 | `✓ 7..13 … (all six legs)` | **ESCAPES** | same |
| 11 | `PASS 7–13 … (all six legs)` (no `✓`) | **ESCAPES** | same |
| 12 | `✓ 7–13 … (six legs)` / `(covers six of them)` — no `all` | **ESCAPES** | declared in substance (`all <count>` required) |
| 13 | `✓ 7–13 … (all` + next line `six legs)` — split across lines | **ESCAPES** | declared ("on the same line") |
| 14 | label spellings `raw output:` / `console:` / `raw :` | **ESCAPES** | declared ("one of two spellings") |
| 15 | label `RAW:` uppercase | **CAUGHT** | case-insensitive |
| 16 | **fence-inline label** ` ```raw: ` as the opening line | **ESCAPES (exit 0)** | **NO — the fence line IS the introducing line, and the docblock does not exclude it** |
| 17 | label then **≥4 blank lines** then fence | **ESCAPES (exit 0)** | **NO — no window is stated anywhere** |
| 18 | report at `reports/sub/zz-probe.md`, or `notes/zz-probe.md`, or `docs/zz-probe.md`, or `reports/x.markdown` | **ESCAPES (exit 0)** | **NO — the scan set (top-level `*.md` in `reports/` + `briefs/` only) is not disclosed in the docblock** |

Window pinned by bisection: label 1–3 lines above the fence → caught (exit 1); 4+ blank lines → not read at all
(the note drops to `0 block(s) … 0 range summaries`). The docblock says the rule applies to "a block whose
introducing line carries `raw:` or `verbatim`" — a label four blank lines up *is* the introducing line by any
reading, and it is silently unchecked. Same for a fence-inline label.

**And the shape is still live in the corpus, outside the rule's reach:** `grep -rnE "✓\s*[0-9]+\s*[–—-]\s*[0-9]+"`
across `reports/ + briefs/` finds `slice-8a-review.md:252` and `slice-8a-review-3.md:152`, both carrying
`✓ 7–13 signup-zip-fallback.e2e.ts (all six legs)`. Neither is inside a labelled fence, so neither fires — the
same fabricated arithmetic the rule exists for, in prose, passes. (Those two are *mentioning* the defect, so
firing there would be wrong; the point is that "the shape cannot reach a reviewer again" is true only for the
fenced spelling.)

### (d) THE ZERO CASE — judgement, not a pass

At this tree the rule prints
`10 block(s) introduced as raw:/verbatim read, 0 range summaries checked — NOTHING was checked: no raw-labelled
range summary exists in this scan`, and the run is **green** (**11** blocks after the sibling round-4 review
landed; still 0 ranges, still exit 0 — see item 8 below). **The reasoning is sound, and the disclosure is
accurate — with one precision note and one residual.** Grounds:

- The zero is not an empty measurement *consumed as a health claim*. I A/B-tested the claim-list gate: with the
  10-block/0-range corpus the summary's `ok —` line **omits** "every step-range summary inside a
  raw-/verbatim-labelled block agrees with its own `all N` count"; with a single agreeing range planted in a
  `/tmp` root the same line **includes** it. Nothing downstream reads the empty set as this rule having
  vouched for anything.
- The counterfactual is real: making the zero a finding fires on every scanned root with a report and no such
  block — which is most of the check harness's own seeds (they write `zz-*.md` reports), and every slice root
  that never wrote a fenced range summary. The guard's own check would have to seed a *passing* world red.
- Disclosure accuracy, re-measured: note text matches FR3-1 word for word; block count 10 and range count 0 are
  what my independent scan produces; the corpus at `1c24fcc` really was 11 / 1.
- Precision note: a root with **no** report/brief file at all returns before the rule runs
  (`if (!files.length) … unchecked here`), so the fire set is "≥1 report **and** no raw-labelled range
  summary", not "no raw block" — the builder's phrasing is one step broader than the mechanism.
- **Residual (the part of D-030's shape that survives):** the *input* number — 10 blocks — is printed and
  asserted by nothing. A partial regression of the parse (the intro window narrowing, the fence-state machine
  breaking, the scan set changing) shrinks that 10 silently, leaves ranges at 0, and the guard still prints
  PASS. The harness seed only pins the most forgiving shape (label one blank line above the fence, en-dash,
  `all six`), so a narrowing of the window from 4 lines to 1 would pass every check. If the round wants the
  zero to be trustworthy rather than merely honest, the second seed shape from escape #17 is the one to add —
  as it stands, "NOTHING was checked" cannot distinguish "nothing to check" from "stopped checking".

---

## 5. The scanner-vs-parser measurement — RE-DERIVED, and it holds exactly

I extracted the **real** `codeOnly` from `src/lib/avatarUrl.test.ts` (30 lines, the text between
`function codeOnly(source: string): string {` and its closing brace), stripped only its TS annotations, and
ran it over the real `src/pages/ProfilePage.tsx` (102,728 chars), comparing position by position against
`@babel/parser` 7.29.8's comment ranges:

| quantity | builder's claim | **I measured** |
|---|---|---|
| comment chars | 33,798 | **33,798** non-whitespace comment chars (216 comment nodes; 43,248 total incl. spaces) |
| blanked | 33,798 | **33,798** |
| leaked | 0 | **0** |
| over-blanked | 0 | **0** |
| real call sites | one, at `ProfilePage.tsx:1227` | **one**: AST `CallExpression` → `hasAvatarUrl(profile.avatar_url)`, source line **1227**; `/hasAvatarUrl\(/` = 1 in the raw source and 1 in the comment-free view |
| regex literals | 0 | **0** (`RegExpLiteral` count over the AST) |

Stronger than a count comparison: the **blanked position set is exactly the parser's comment position set**
(`POSITION-SET equality: true`, leaks 0, over-blanks 0 — the view is byte-length-identical to the source). On
this one file, at this revision, the hand-written scanner is exactly a parser's comment stripper, so the leg is
measuring what it claims. **One wording nit, not a discrepancy:** the ceiling says "the file has no JSX-text
apostrophe"; measured, there is **one JSX-text apostrophe** — `That’s`, U+2019, typographic. The scanner tracks
ASCII quotes only, so the vector is genuinely unreachable (ASCII `'` in JSXText: **0**), but the sentence is
true of the *vector* rather than of the file.

---

## 6. The baseline absorber (FR3-4) — committed map == freshly derived map

    output: (throwaway copy of the guard with BARE_HEAD_BASELINE emptied, run --root <repo> --repo <repo>)
    committed map:          435 entries, 435 distinct keys, 669 recorded occurrences
    emptied-map run:        669 FINDING lines -> 435 distinct keys, 669 occurrences
    keys only in DERIVED (not absorbed): 0
    keys only in COMMITTED (coverage loss):  0
    count mismatches on shared keys: 0

FR3-4's numbers reproduce on the committed tree (`669 recorded occurrence(s)` is also what the guard prints at
this tree), coverage loss is **0**, and the derivation is idempotent: `run-all.sh` twice, identical PASS.

---

## 7. Residual risks / non-blocking findings

1. **[DOC DEFECT, non-blocking] The ceiling's second bullet is false as written.**
   `factory-guard.mjs:1530-1532` says *"a block that names no command is NOT checked"*. Measured: the rule is
   purely syntactic on the range/count line, and a block that names **no command at all** IS checked — that is
   exactly what the rule's own seed and control in `factory-guard.check.mjs:1205-1210` are (they contain only
   `Running 3 tests using 1 worker` + the summary line, no command), and both fire. The intended limit is "the
   rule does not verify reproducibility — it never re-runs the command", which is a different sentence. Same
   class as the round-2 alias clause (a stated limit the mechanism does not have).
2. **[UNDER-DECLARED BOUNDARY] A word count above twelve is not read.** `WORDS` maps one…twelve; `all thirteen`
   → `count === undefined` → `continue`. Seed #6, span 12, exits 0. Nothing in the docblock says the count
   vocabulary is finite, and this is squarely *inside* the shape the docblock claims to read.
3. **[UNDER-DECLARED BOUNDARY] The 4-line intro window is invisible.** Label ≥4 blank lines above the fence →
   the block is not read at all (seed #17), and the fence-inline ` ```raw: ` spelling (seed #16) is likewise not
   read, though the fence line is the introducing line. Neither is named.
4. **[UNDER-DECLARED BOUNDARY] The scan set is undisclosed.** Only top-level `*.md` under `.scratch/v28/reports`
   and `.scratch/v28/briefs` is read (seeds #18: subdirectory, sibling directory, non-`.md`, `docs/` all escape).
   A raw-labelled fabrication anywhere else is invisible.
5. **[Coverage gap, live] The corpus still carries the defect shape in prose** — `slice-8a-review.md:252`,
   `slice-8a-review-3.md:152`. Out of the rule's declared scope, so not a false negative against its ceiling,
   but "the shape cannot produce this finding a fourth time" is true of the fenced spelling only.
6. **[Wording] "the file has no JSX-text apostrophe"** — it has one, typographic (`That’s`); the ASCII vector
   is what is absent, measured at 0.
7. **[Pre-existing, unchanged, still 8b-owned]** the `lib-sibling-guard.sh` `checked=0` hole and
   `factory-guard.mjs`'s zero-file report/brief path (`unchecked here` and pass). I re-read the latter at this
   tree: it is the same shape as (d)'s residual, one level up, and the round did not touch `factory/`.
8. **[Lane-record tax, hit and resolved] This report itself tripped the new rule on its first write.**
   Rendering the seed faithfully — label line directly above the fence — planted the shape in
   `slice-8a-verify-4.md:121`, and `node scripts/guards/factory-guard.mjs` returned **exit 1**:
   `FINDING [transcript-summary-agrees]: .scratch/v28/reports/slice-8a-verify-4.md:121: a raw block's summary
   line covers 7 entries (7–13) but states "(all six"` (block count 10 → 11). Reworded — the seed is described
   rather than rendered next to a label — the guard is **exit 0** again (`10 block(s), 0 range summaries` at
   that moment; **11** blocks once the sibling round-4 review report landed, its own mention of the shape
   adding a labelled block and no range, still 0 findings).
   That the rule fired on the verifier's own first draft is the strongest single piece of evidence here that it
   is not vacuous; it is also the corpus tax the brief names. Unlike provenance shas, this rule has **no
   use/mention absorber**: a lane report that quotes the shape inside a labelled fence is indistinguishable from
   one that uses it, so a reviewer transcribing the defect must reword it (as this report now does).

**Recommended next action (one line):** keep the rule as the right instrument for the shape, and in the same
commit (i) correct the "names no command" bullet to say what it means (no reproducibility re-run), (ii) name
the twelve-word ceiling, the 4-line intro window, the fence-inline spelling and the scan set in the docblock,
and (iii) add one check seed with the label two+ blank lines above the fence, so the zero at the real root
cannot hide a narrowed window.
