# Slice 8b — VERIFICATION, ROUND 5 (fresh context)

**VERIFY: FAIL**

Working tree `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`. Branch tip `341c0bb`; the round-5 fix
commit `4ebdcf8`; the base for the parser comparison `6dcbe84` (its parent). `git status --porcelain` was empty
before and after every run; the only file written inside the repo is this report. Every probe ran in a `/tmp`
throwaway root, or against a copy extracted with `git show` / `git archive`; no inference server was started or
stopped and nothing was pushed.

(The seed's check-mark is written `[CHECK-MARK]` in the two seed listings so that quoting the fabricated line does not redden this report's own scan; the marker is the literal U+2713.)

Read first, as instructed: the fix-round-5 section of `.scratch/v28/reports/slice-8b.md`, and `factory/decisions.md`
D-028, D-030, D-032, D-035, D-036.

**The verdict is FAIL on ONE thing only: the round's headline claim — "the fence parser is made
CommonMark-conformant" — is falsified on a neighbouring input (a closing fence indented four or more spaces), in
the unsafe direction: the guard closes the block early and a fabricated transcript inside it is read by neither.**
Every deterministic lane is green (below). The failing input is not one of the six the brief listed; it is the next
one over, and it is the batch's exact class. It is pre-existing (the base parser behaves identically) and latent in
the live corpus (zero occurrences), which is why it needs a recorded decision rather than a silent close.

## 1. `npm run verify` — exit 0 (re-measured)

| quantity | builder claimed | **re-measured** | agree |
|---|---|---|---|
| exit code | 0 | **0** | yes |
| Test Files | 71 | **71** (`Test Files  71 passed (71)`) — independently `find src e2e scripts -name '*.test.ts*'` = **71** | yes |
| Tests | 2063 | **2063** (`Tests  2063 passed (2063)`) | yes |
| lint warnings (`grep -c ": warning "`) | 81 | **81** | yes |
| lint errors (`grep -c ": error "`) | 0 | **0** | yes |
| AGENTS.md | 1789 vs ceiling 1800 | **1789 words, ceiling 1800** | yes |
| guards | PASS | **`GUARDS: PASS — all deterministic rules hold.`** | yes |

```
 Test Files  71 passed (71)
      Tests  2063 passed (2063)
  ok — AGENTS.md (1789 words, ceiling 1800)
PASS — steering layer is clean.
PASS — every positively-used e2e locator literal still exists in src.
PASS — the escape has exactly one home.
PASS — the newline convention holds across the scan set.
factory-guard check: all 146 checks passed.
GUARDS: PASS — all deterministic rules hold.
VERIFY EXIT=0
```

The guard was RED at **8 findings** until the two lane reports were repaired by their authors at `341c0bb`. Re-measured
both sides of that repair: the `4ebdcf8` guard run on the `4ebdcf8` tree reports `FAIL — 8 factory finding(s)`, every
one a `no-bare-head-count` in `slice-8b-review-4.md` / `slice-8b-review-independent.md`; the current guard run on the
current tree reports `PASS` with **0 findings**. No finding remains; none was absorbed or edited by anyone but the
reports' authors (no baseline widened).

## 2. `node scripts/guards/factory-guard.check.mjs` — exit 0, 146

```
$ node scripts/guards/factory-guard.check.mjs ; echo CHECKER_EXIT=$?
factory-guard check: all 146 checks passed.
CHECKER_EXIT=0
$ grep -c "✓" <checker output>   -> 146
```

Independent count, the way the round-2 verifier did it (static call sites + loop expansions):

- **134** statements begin with `check(` (the two other `check(` matches are a string literal at `:1251` and the
  final `console.error` message at `:1875`).
- Of those 134, **4** sit inside loops: 1 in `separators` (4 members), 1 in `sweepShapes` (6 members), 2 in
  `emptyRecords` (3 rows).
- Expansions: `4×1 + 6×1 + 3×2 = 16`; the 4 in-loop call sites are replaced by it: `134 − 4 + 16 =` **146**.

The arithmetic reaches 146, and `grep -c "✓"` on the real output agrees. The `+9` over the prior 137 is the round's
own additions (check-13 mutation, the nested-fence seed+mutation, and the six 20B claim-gate checks).

## 3. The parser — tested against a reference, not against a reading of the spec

### 3a. The round's escape, both halves, on one seed

Seed (`/tmp/probe-r5`): a header, an outer backtick fence with info string `md`, an inner backtick fence with info
string `js`, the fabricated line, then the outer closer (one block).

```
# zz nested fence probe

[OPEN backtick x3, info "md"]
[OPEN backtick x3, info "js"]
[CHECK-MARK] 7–13 zz-spec.e2e.ts (all six legs)
[CLOSE backtick x3]
```

The old guard (`git show 6dcbe84:scripts/guards/factory-guard.mjs` -> `/tmp/g-base.mjs`):

```
  note — transcript-summary-agrees: 2 fenced block(s) read, 0 range summaries checked — NOTHING was compared: no fenced block in this scan states a step range beside its count
  note — transcript-summary-agrees: quotation baseline holds 2 recorded site(s) … 0 of the 2 ABSORBED this scan (LOST COVERAGE 2)
```

The new guard (current tree):

```
  note — transcript-summary-agrees: 1 fenced block(s) read, 1 range summary checked
  FINDING [transcript-summary-agrees]: .scratch/v28/reports/zz-nest.md:5: a fenced block's summary line covers 7 entries (7–13) but states "(all six" — a captured transcript must reproduce its own arithmetic
```

Both halves reproduced with the exit code moving for the rule (the probe root's only other finding is the throwaway
root's missing `factory/config.json`, present in both runs): pre-fix **0 range summaries compared**, the fabricated
line in no parsed block; post-fix **1 compared**, FINDING. On a full `git archive` of the base (`6dcbe84`) with the nested seed and the two lane reports held
aside (so their unrelated bare-head findings do not mask it), the pre-fix side is a literal `PASS`, exit 0 (the
escape); the current guard on that same root is `FAIL — 1 factory finding(s)` (the transcript), exit 1.

### 3b. Cross-check against a real markdown implementation — AGREE on the round's input

I installed the CommonMark reference implementation `commonmark@0.31.2` and `marked@18.0.14` in `/tmp/mdref`
(throwaway; nothing installed in the repo) and compared the guard's per-line "inside a fenced code block" verdict
against both, on the exact nested seed and on the six attacks. On the nested seed: **AGREE** — guard block
`[content 3, end 5)`, the fabricated line is line 5, and both references put it inside the `<pre><code>` block. The
builder's AGREE claim holds for the input the round tested.

### 3c. The six attacks through the real guard

| attack | result |
|---|---|
| a SHORTER closer run (`four-backtick` opener, a `three-backtick` line inside) | **CAUGHT** — the three-run does not close the four-run block; the fabricated line fires |
| a closer with trailing text (`marker` + words) | **CAUGHT** — treated as content, not a closer |
| a tilde fence | **CAUGHT** |
| a backtick opener whose info string contains a backtick | **NOT a fence** — correct; CommonMark and marked agree, so the fabricated line is outside any block and correctly not read |
| an UNCLOSED fence | **CAUGHT** — content runs to end of file |
| a fence of the other kind nested inside | **CAUGHT** — the inner marker is content |

Real guard, six seeds in one root: `6 fenced block(s) read, 5 range summaries checked` and five FINDINGs (all but
the info-string seed). All six agree with `commonmark@0.31.2` and `marked@18.0.14`.

### 3d. The neighbouring input the fix gets WRONG (the FAIL)

A **closing** fence indented four or more spaces. CommonMark closes only on a same-kind run indented at most **three**
spaces; a four-space-indented marker inside an open fence is content. The guard uses one regex (`^\\s*`) for opener
and closer alike, so its closer also matches at four spaces and **closes the block early**.

Seed (`/tmp/probe-indent`): outer backtick fence with info `md`, then a **four-space-indented** closer, then the
fabricated line, then a real closer.

```
# zz 4-space-indented closer

[OPEN backtick x3, info "md"]
    [CLOSE backtick x3, four spaces of indent]
[CHECK-MARK] 7–13 zz-spec.e2e.ts (all six legs)
[CLOSE backtick x3]
```

Current guard:

```
  note — transcript-summary-agrees: 2 fenced block(s) read, 0 range summaries checked — NOTHING was compared: no fenced block in this scan states a step range beside its count
```

The fabricated line is in **no parsed block**. `commonmark@0.31.2` and `marked@18.0.14` both keep it **inside** the
code block (their per-line verdicts: inside, inside; the guard: outside, outside). So the guard's parse and the
reference **DISAGREE** on this input, and the disagreement is in the unsafe direction: content CommonMark reads as
inside the fence is hidden from the rule. This is the same signature D-031/D-032/D-035 exist for — `NOTHING was
compared`, and the fabricated contradiction goes unread.

Two facts bound the severity, and both must be stated plainly:

- **It is pre-existing, not introduced by round 5.** The base guard (`6dcbe84`) behaves identically on the same
  seed (`2 fenced block(s) read, 0 range summaries checked`). The round-5 fix corrected the run-length and
  info-string closure rules and left the indentation over-read on **both** ends of the fence.
- **It is latent in this corpus.** `grep -rE "^ {4,}(\`{3,}|~{3,})"` over `.scratch/v28/reports` and
  `.scratch/v28/briefs` finds **0** lines. No live report can reach it today.

It is still a real non-conformance, because the guard's own ceiling says the opposite of what the measurement shows.
The ceiling (`factory-guard.mjs` around `:1667-1671`) declares: "The fence regex deliberately accepts LEADING
WHITESPACE … **over-reading is the safe direction**, and tightening the regex to `^ {0,3}` would open exactly the
escape this sentence would then have to declare." That reasoning is true for an **opener** (accepting more indent
reads more) and **false for a closer** (accepting more indent closes sooner and reads **less**). The declaration does
not distinguish the two, so it certifies as safe an asymmetry that is unsafe at one end.

The fix for a future round is one line and does not reopen the opener over-read: keep any-whitespace acceptance on
the **opener**, and require at most three spaces (CommonMark's own rule) on the **closer**. Whether that is a repair
or a recorded known-open is the orchestrator's call; I report it as a measured non-conformance.

### 3e. Fuzz

20,000 random fence-line sequences drawn from an alphabet of openers, closers, info strings, the fabricated
transcript line and legal indentation (all lines <= 3 spaces of indent) produced **0** per-line divergences between
the guard and `commonmark@0.31.2`. With four-space-indented markers admitted to the alphabet, divergences appear,
and every one is the 3d shape (closer over-indentation) or its mirror; the fabricated-transcript direction is the
under-read called out above.

## 4. Check 13's seed — a fixture, and it fails loudly

`factory-guard.check.mjs:305-354`. The seed now builds its one-qualified world inside the check:

- `oneQualifiedWorld()` deep-copies `REAL_CONFIG` (`JSON.parse(JSON.stringify(...))`) and deletes all but the
  strongest reviewer-qualified model; `seedWorld` writes that copy into the throwaway root. Confirmed the live
  registry is not touched: `sha256(factory/config.json)` identical before and after a full checker run.
- **It still moves the exit code:** `✓ MUTATION: dropping the gap condition lets the one-model registry PASS
  (exit 1 -> 0 — a DETECTION flip)`.
- **A control proves it is not always-red:** `✓ the one-qualified world WITH the acknowledgement passes (control)`.
- **It cannot silently pass on a one-qualifier registry.** Re-measured by extracting the function and calling it
  against a registry reduced to one qualifier: `THROWS: the live registry holds 1 reviewer-qualified model(s); this
  check needs at least 2 to build the one-qualified world`. End to end, a checker copy with a one-qualifier
  `factory/config.json` exits **1** with **90 check(s) failed**. It is loud, not silent.

The one honest qualifier: the world is a **fixture** (written to a temp root, not the live file), but it is still
**derived** from the live registry. If a future registry is legal with fewer than two qualifiers, or if reducing to
one breaks another kind's floor, the check goes red loudly rather than passing vacuously — which is the declared
disposition. It is not fully decoupled; it is loudly coupled (D-030 at one level up, discharged by a tripwire).

## 5. The two claim gates — no claim over a zero measurement

`provenanceChecked` and `transcriptsChecked` are now counts (`checkTranscripts` returns a comparison count;
`checkReportHeadCounts` returns `provenanceTokens`), and the existing `if (provenanceTokens)` / `if (transcriptsCompared)`
gates publish only over a measurement. I ran the ZERO case against the current guard independently (a clean root with
a clean report and `--repo` at this repo):

```
  note — count-provenance: 0 provenance token(s) in the scan … — 0 unresolvable
  ok — 6 model(s), 8 task kind(s), 1 work item(s); every floor meetable, every artifact present, no report or brief count resolved through bare HEAD beyond the recorded baseline
PASS — the registry can be trusted and no work item claims evidence it does not have.
```

`PROVENANCE CLAIM: withheld` and `TRANSCRIPT CLAIM: withheld` (also the range claim). The checker's own six halves
all pass: zero provenance does **not** claim the shas were verified; a token read **does** (control); the
unconditional mutation publishes over zero (so the seed can fail); and the same three for transcripts. No claim is
printed over a non-measurement.

## 6. `LOST COVERAGE 1` against the quotation baseline

The live run prints:

```
  note — transcript-summary-agrees: quotation baseline holds 4 recorded site(s), re-derived and never hand-added; a NEW site, or a second occurrence of a recorded one in the same file, is a finding — 3 of the 4 ABSORBED this scan (LOST COVERAGE 1)
```

**It does not gate** — it is a `console.log`, not a `fail()`, and `npm run verify` exits 0 with `GUARDS: PASS`.
Emptied-baseline run on the live tree lists exactly **3** firing sites (`.scratch/v28/reports/slice-8a-verify-5.md:37`,
`slice-8b-review.md:89`, `slice-8b-review.md:193`). The committed record's `SIZE` is **4**, because its third key is
one line that carries two range/count pairs and is recorded with count 2 — while only one of those pairs fires (the
first, `1–6` vs "six", agrees and returns before the absorbed increment; the second, `7–13` vs "six", fires). The
guard's own comment says this exactly: the printed number is `size − ABSORBED` where ABSORBED counts **findings**,
so "a line whose arithmetic had become correct … read[s] as lost coverage". So the number **names a real discrepancy
between the record and what fired**, and it is honest by the declared arithmetic.

Two corrections to the brief's framing, both measured:

- The number was **already 1 at the fix commit**. Running `4ebdcf8`'s own guard against a `git archive` of the
  `4ebdcf8` tree prints the identical `3 of the 4 ABSORBED … (LOST COVERAGE 1)`. It is not the product of a later
  edit.
- The two lane reports edited at `341c0bb` are **not** baseline keys (the keys are for `slice-8a-verify-5.md` and
  `slice-8b-review.md`), and the `slice-8b-review.md:193` line is unchanged since `1de1905`, before the baseline
  existed. So "because one lane report was edited after the baseline was derived" does not explain it. The loss is a
  **derivation artifact**: `SIZE` counts pair-iterations, `ABSORBED` counts firing pairs. The builder's fix-round-5
  report claim that "on the live corpus it is LOST COVERAGE 0" is **false** — re-measured at `4ebdcf8` itself as 1.

The number is therefore not stale; it is a truthful `size − absorbed` over a baseline whose size is one pair loose.
It neither gates nor hides anything on its own.

## Findings

1. **[FAIL, conformance] The parser is non-conformant on an over-indented closer** (`factory-guard.mjs:1788`): a
   four-or-more-space-indented same-kind marker closes an open fence, where CommonMark (`commonmark@0.31.2`) and
   `marked@18.0.14` both keep it as content. Measured escape: the fabricated line lands in no parsed block
   (`2 fenced block(s) read, 0 range summaries checked`). Pre-existing at `6dcbe84`; latent (0 corpus lines); the
   guard's declared ceiling calls leading-whitespace acceptance "the safe direction", which is false for a closer.
2. **[PROSE, false claim] `slice-8b.md` fix-round-5 says the live corpus prints `LOST COVERAGE 0`.** It prints
   `LOST COVERAGE 1`, and did so at the fix commit. (D-028: a number in prose is a claim.)
3. **[PROSE, incorrect cause] The brief's account that `LOST COVERAGE 1` is "because one lane report was edited
   after the baseline was derived" is not supported** by the files or the commits (see section 6).

## Residual risks

- The over-indented-closer escape is latent only because no report currently contains such a line; it is reachable
  by any future lane that writes one inside a fence.
- Check 13's fixture is derived from the live registry, so its control remains coupled to registry shape; the
  coupling is loud (throws / 90 red checks) rather than silent, as declared.
- The quotation baseline's `SIZE` over-counts firing sites by one; a future reader who takes `LOST COVERAGE 0` as
  the healthy state will see a permanent 1.
