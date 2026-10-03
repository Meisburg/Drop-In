# Slice 8a — fresh-context review, ROUND 4 (round-3 fix, `1c30d6a..7b72207`)

## DISCLOSURE (required, D-007 / D-015)

**I am a sibling model, not an independent reviewer.** Fresh *conversation*, not an independent instrument.
Weigh this verdict accordingly (D-015).

**What I ran (read-only outside this report):** `git log` / `git show` / `git diff` / `git archive`;
`node scripts/guards/factory-guard.mjs` (4 runs, incl. twice back-to-back for determinism); a throwaway copy of
it with `BARE_HEAD_BASELINE` emptied (the absorber's own re-derivation, compared key-for-key against the
committed map); a throwaway copy with a mutation that makes the new rule's zero case a finding (to price the
tripwire the builder declined); a throwaway copy with a label-set tripwire; `bash scripts/guards/run-all.sh`
(**exit 0, `GUARDS: PASS`, `factory-guard check: all 93 checks passed`**); `node --check`; and
`@babel/parser` 7.29.8 (already in `node_modules`) over `src/pages/ProfilePage.tsx`, plus the REAL `codeOnly`
extracted textually out of `src/lib/avatarUrl.test.ts` and run over ten inputs. **What I did NOT do:** I did
not run `npm run verify`'s test half, `vitest`, or any Playwright spec — my lane does not run the suite, and
the builder's success claim is not evidence.

**Range note — the tip moved while I reviewed.** The brief names `1c30d6a..7b72207`, but `HEAD` advanced to
`5abc1a4` mid-session (the newest reflog entry is a commit whose subject begins "8a: fix round 3 recorded …"). I diffed it:
`5abc1a4` touches **`.scratch/v28/ledger.md` only** (5 inserted lines). The four files this round is judged on
(`factory-guard.mjs`, `factory-guard.check.mjs`, `src/lib/avatarUrl.test.ts`, `slice-8a.md`) are byte-identical
between `7b72207` and `5abc1a4`, so the review object is unchanged — recorded because a range claim should
reproduce, and because one of my guard runs exited 1 in the window when an orchestrator commit landed (the gate
reads a working tree that other lanes are writing; see RESIDUAL).

---

## VERDICT: **NEEDS_CHANGES** — 2 blocking findings, both in the round's own new rule.

The structural route's two halves are **real and I reproduced the headline claim byte-for-byte**. The block is
gone. The rule exists, fires on the live defect, and is mutation-proven. The ceiling rewrite is **true of the
mechanism** where round 2's was backwards. The block is: the new rule's own two counters — the same file, the
same function, the same commit — carry a D-030 hole the round did not declare, and a coverage number the
mechanism does not support. Everything else is non-blocking.

---

## ADJUDICATIONS (one line each, as asked)

**1. The structural route — HOLDS, with a measured near-variant that recurs green.**
Both halves are real: the fabricated block is deleted (the diff removes it and leaves a 10-line tombstone
pointing at F3), and the shape is a red gate. **I re-introduced the fabricated block in a throwaway root and the
gate caught it**: `node scripts/guards/factory-guard.mjs --root <root> --repo <repo>` →
`exit 1`, `FINDING [transcript-summary-agrees]: .scratch/v28/reports/zz-a.md:7: a raw block's summary line
covers 7 entries (7–13) but states "(all six"`. The stronger form reproduces too: with the report as it stood at
`6d22351` (pre-deletion) as the scan set, the run prints **`11 block(s) … 1 range summary checked`** and
`FINDING … .scratch/v28/reports/slice-8a.md:179 …` — **exactly** FR3-1's paste, line number included. So the
instance is gone and the shape is a gate *for the spelling that recurred*: **the finding cannot recur a fourth
time as it recurred three times.** It CAN recur in a near-variant, measured: one non-empty prose line between
`raw:` and its fence makes the block unlabelled (seed → `exit 0`, note says `0 block(s) … NOTHING was
checked`), and a `raw:`-labelled transcript written as an **indented** code block is invisible to the rule
(live example in the corpus, `.scratch/v28/reports/slice-8a-verify.md:159`). That is BLK-2 below — the route is
structural, the *claim that the shape is covered* is not yet true of the mechanism.

**2. The alias ceiling — HOLDS; the named remedy is right in direction.**
Verified with leg 1's own regex over the REAL `codeOnly` extracted from the test file: `import { hasAvatarUrl as
pred } …; pred(x)` → **false**; `const p = hasAvatarUrl; p(x)` → **false**; `hasAvatarUrl(a)` → true;
`hasAvatarUrl(x ?? '')` → true. The docblock now says the opposite of round 2 and the same as the mechanism: an
aliased **callee** is a false FAIL, a differently-spelled **argument** passes. "Fix the regex here, do NOT
delete the leg" is the right direction (the leg is doing the job it exists for); the only gap is that "fix the
regex" is not achievable from the call line alone — the alias name lives in the file's `import` statement, so
the sentence should say the read has to include the import binding. Not blocking.

**3. The two false-pass vectors — HOLD, each with its measurement of absence, and the residual risk stated.**
I reproduced both measurements with a parser, not with the report's instrument: `@babel/parser` over
`src/pages/ProfilePage.tsx` → **0 `RegExpLiteral`**; **exactly one** `hasAvatarUrl(`, at `ProfilePage.tsx:1227`,
and the AST confirms it is the real `CallExpression` (`hasAvatarUrl(profile.avatar_url)`, not string data);
**zero `JSXText` nodes containing an apostrophe** (AST-measured — the right instrument for "no JSX-text
apostrophe"); and the scanner's view vs the source differs at **33,798** characters, all of them inside comment
spans — **`leaks: 0`, `over-blanks: 0`**. The ceilings name both vectors as reachable-in-principle and absent
today, and the docblock names the residual risk ("a future edit that adds either vector would change what the
leg measures WITHOUT failing it"). One number in it needs a qualifier (NON-BLOCKING 1).

**4. The table row and the other prose — the row is a real change; the tombstone is a sentence about a change
that points at something real.**
The `:455` row now renders: **3 fields between 4 unescaped pipes, 2 escaped pipes inside the code span**
(measured with a split on unescaped `|`) — the row was broken for a reader and is fixed. The §3 replacement is
10 lines of prose explaining a 12-line deletion — a sentence about a change, and D-028 item 4 ("do not add a
sentence to explain a deleted one") is in tension with it — but the tombstone names a **verified** destination:
F3's transcript holds **13 `✓` lines one per line** (I counted them), of which `signup-zip-fallback.e2e.ts`
owns **seven** (`:155 :238 :294 :381 :468 :583 :644`), so "seven legs for a seven-leg spec" is true and the
deleted block's "all six legs" was false. FR3-3's "DONE BY THE ORCHESTRATOR" row is also a sentence about
another lane's change — verified true: `.opencode/agents/orchestrator.md:302-304` carries the rule and the live
case. FR3-4's baseline numbers are real: I re-derived them (see CLASS HUNT).

**5. THE ZERO CASE — I land on: the note-not-finding is DEFENSIBLE AS POLICY, and NOT DEFENSIBLE AS MEASURED.**
This is the adjudication the brief asked for, so the reasoning is explicit:
- *For the policy.* D-030's sin is a **failed look** consumed as health. Here the look happened: the scan set
  (report/brief `.md` files) is non-empty, and the rule reads **10** labelled blocks. `ranges === 0` is "the
  detector's pattern did not match in a non-empty scan" — the normal state of a healthy corpus — not "nothing
  was scanned". The run says so in words (`NOTHING was checked: no raw-labelled range summary exists in this
  scan`) and the guard's claim list **omits the rule**: I verified both directions (with a matching range the
  `ok —` line carries the claim; with zero it does not). A blunt "fire when the root has reports but no raw
  block" would be wrong: I measured its cost — **30 of the 93 harness checks fail** under that mutant, every one
  of them a legitimate seed whose report simply has no raw block.
- *Against the measured version.* The two numbers printed beside the zero are not measurements of what they say
  (BLK-2), and inside the same function sits an **undeclared** zero: a range summary whose stated count is
  outside the `WORDS` table is counted as *checked* and the rule's claim is **published** (BLK-1). So the zero
  path the builder declared is not the zero path that is dangerous. The invariant ("zero is a finding, never a
  pass") is not satisfied by disclosure alone where the disclosure is a coverage claim that is false.
- *The narrower tripwire, concretely.* **Watch the LABEL set, not the range set** — fire when a line in the
  corpus's own label form (`… raw:` / `Verbatim:` / `… raw:**`) is present and no fence in that file is
  attributed to it: "I saw a label and did not read the block it names" is a contradiction between two of the
  rule's own measurements, and it distinguishes "no raw block exists" from "raw blocks I failed to attribute".
  Measured: **0 of the 93 harness checks break** under that mutant, and it fires on the live corpus
  (**10 label lines, 5 unattributed** — `.scratch/v28/reports/slice-6c-fix-6.md:999`, `slice-8a.md:645`,
  `slice-8a-verify.md:159`, `briefs/slice-1-fix-1.md:52,:66`, `briefs/slice-2a-fix-1.md:52`). The fires are the
  work: each is a label whose block must either be read (indented blocks, a label more than one prose line above
  its fence) or disowned in the ceiling. *If the builder prefers the brief's own suggested form* ("fire when the
  root HAS reports but none carries a raw block"), the price is the 30 checks above and a mechanism change to
  the 30 seeds — measured, not estimated.

**6. The fourth zero-check path — YES, it should have been fixed here, not registered.**
Direct answer: **this round added one, and it is the first *new* one.** Precisely: the two registered for 8b are
`scripts/guards/lib-sibling-guard.sh` (`checked=0`, a different file) and `factory-guard.mjs:1403-1406` (no
report/brief dirs → `unchecked here` → PASS). This round's new rule adds
`factory-guard.mjs:1579` (`ranges === 0` → note → PASS) **and** extends the second hole: the early return's
object omits `rawSummaryLines`, so on a root with no reports the new rule is skipped *and its note is not even
printed* (measured: a no-reports root prints the two `unchecked here` notes and PASSES, with no mention of
`transcript-summary-agrees`). Given (a) the invariant is the batch's central lesson, (b) the slice was already
editing this function and already shipped a seed/mutation/control for the new rule, and (c) the narrow tripwire
costs **0 of 93 checks**, the correct move was to land it in the commit that added the rule. Registering it
would make 8b carry a hole born in a round that had the file open, in a batch where every round that has touched
this file has produced one.

---

## BLOCKING

### BLK-1. [MECHANISM / FALSE CLAIM — `ladder:`] `factory-guard.mjs:1569,1572,1579,1642` — an out-of-table count is counted as CHECKED and the rule's claim is published for it

`function checkRawBlockSummaries` (`:1543`) increments `ranges` (`:1569` — the note's "range summaries checked")
**before** it decides whether a comparison is possible, then skips the comparison when the stated count is a
word it does not know (`:1572`, `const WORDS = ` at `:1544` holds `one`…`twelve`). `ranges` gates the claim
(`:1642`), so the run publishes *"every step-range summary inside a raw-/verbatim-labelled block agrees with its
own "all N" count"* for a summary it never compared. Measured, throwaway root with the real registry and one
report containing `✓ 1–13 zz.e2e.ts (all thirteen legs)` inside a `raw:`-labelled block:

```
$ node scripts/guards/factory-guard.mjs --root <root> --repo <repo>
  note — transcript-summary-agrees: 1 block(s) introduced as raw:/verbatim read, 1 range summary checked
  ok — … every step-range summary inside a raw-/verbatim-labelled block agrees with its own "all N" count …
  PASS — …                                                                    EXIT=0
```

Thirteen entries, "all thirteen", no comparison, a published claim. Same seed with in-table words behaves
correctly (`all six` → exit 1; `all seven` → exit 0), which is why no existing seed can see this: the seed, the
mutation and the control (`factory-guard.check.mjs:1202-1235`) all use `six`/`seven`. **The mutation's own
anchor is the hole**: `:1218` mutates `if (count === undefined || count === span) continue` to `if (true)
continue` — it proves the seed flips when the whole comparison is dropped, and it cannot prove anything about
the `count === undefined` disjunct, which is the branch that silently skips. Fix direction: a count that cannot
be resolved to a number is a finding (or the note must count *comparisons performed*, and the claim must not be
published for skipped ones) — the same D-030 move the batch has made twice already.

### BLK-2. [FALSE CLAIM / UNDER-DECLARED BOUNDARY — `ladder:`] `factory-guard.mjs:1579` — the note's coverage number is not what the mechanism measured, and the ceiling does not name the escapes

`blocks` is computed by attributing a fence to "the last NON-EMPTY line within 4 lines above it" (`:1554-1562`),
and is printed as *"N block(s) introduced as raw:/verbatim read"*. Measured against the corpus the rule lives
in, that number is wrong in both directions:
- **Under-counts.** Re-running the rule's own attribution over all 147 scanned report/brief files: **10 lines
  end in a label form, 5 are attributed to no fence.** Three of the dangling five name genuine raw-labelled
  blocks the rule never reads: `.scratch/v28/reports/slice-6c-fix-6.md:999` (`Raw:` → fence at `:1003`),
  `.scratch/v28/reports/slice-8a.md:645` (`**Mutations, raw:**` → fence at `:653`), and
  `.scratch/v28/reports/slice-8a-verify.md:159` (`… and re-run, raw:` → an **indented** code block, which
  `:1556`'s `/^\s*```/` cannot see at all). Two more (`briefs/slice-1-fix-1.md:52,:66`,
  `briefs/slice-2a-fix-1.md:52`) introduce blockquotes.
- **Over-counts.** At least one of the 10 counted is a **fence whose intro line merely contains the adverb
  "verbatim" in prose**: `.scratch/v28/reports/slice-6c-fix-2-verify.md:185` ("… all three mutation anchors
  still exist verbatim at HEAD, so the proofs still speak for the committed code:") introduces the fence at
  `:187`. A non-raw block is therefore inside the rule's read set — a false-positive vector for any such block
  that carries a range line.
- **The escape is one line wide, and it is a false NEGATIVE on the exact shape the rule exists for.** Throwaway
  seed, the same fabrication as the deleted block, with **one non-empty prose line** between the label and the
  fence: `exit 0`, note `0 block(s) introduced as raw:/verbatim read, 0 range summaries checked — NOTHING was
  checked`. The same at two prose lines. (Blank-line separation — how the corpus normally writes it — is caught.)

The docblock's ceiling says "it reads ONE shape … inside a block whose introducing line carries `raw:` or
`verbatim`" and "a fabrication written any other way escapes this detector"; the code comment defines
"introducing line" as the 4-line window. The report's FR3-1 therefore over-states the route in one sentence —
*"the shape cannot produce this finding a fourth time"* — against a measured near-variant that produces exactly
that finding, green and silent. Fix direction: either read the label (the tripwire priced at 0/93 in ADJUDICATION
5, plus indented blocks) or state the exact heuristic in the ceiling and stop printing the attribution count as
coverage — a reader cannot tell "no raw block exists" from "raw blocks I failed to read", and the whole reason
the block's defect recurred three times was a reader trusting a label.

---

## NON-BLOCKING

1. **[WRONG NUMBER / naming — `src/lib/avatarUrl.test.ts:92`]** *"of its 33,798 comment characters the scanner
   blanks 33,798, leaks 0 and over-blanks 0."* The claim's substance is TRUE and I reproduced it, but 33,798 is
   **non-whitespace** comment characters. The comment spans hold **43,742** characters (**43,248** excluding the
   newlines the scanner deliberately preserves; **9,450** of them are spaces, so "blanked" is unobservable for
   those). The reader who re-derives gets a different total than the sentence promises. Say non-whitespace, or
   state all three counts.
2. **[MECHANISM — false attribution]** `.scratch/v28/reports/slice-6c-fix-2-verify.md:185→:187` (see BLK-2):
   the rule reads a block that is not raw-labelled because the word "verbatim" appears in the intro line. Cheap
   fix in the same edit as BLK-2. **This report is the live demonstration**: writing it (it discusses `raw:`
   repeatedly) moved the run's own note from `10 block(s) introduced as raw:/verbatim read` to `11 block(s) …`
   — no raw-labelled block was added, and none was read. `blocks` counts fences preceded by a line mentioning
   `raw:`/`verbatim`; it is not a count of raw blocks, and the note's wording says it is.
3. **[Cosmetic]** The finding's quoted count is the regex's match, not the stated phrase:
   `… but states "(all six" …` (`:1574-1577`). It reproduces exactly and it is honest — the reader sees a
   truncated parenthetical. A `stated[0] + ' …'` would read as a quote.
4. **[MECHANISM — pre-existing, extended]** `factory-guard.mjs:1403-1406`: the no-report-dirs early return
   omits `rawSummaryLines`, so a third rule is silently not run and not mentioned on such a root. This is the
   8b-registered hole; this round widened it without saying so (see ADJUDICATION 6).
5. **[MECHANISM — the absorber's own instrument]** FR3-4's *"COVERAGE LOSS … 0"* is a real measurement (I
   re-derived it — see CLASS HUNT) but the derivation is an **ad-hoc procedure written in prose**, not a
   committed tool, so the next round cannot re-run it to re-verify; the guard's own protection is only the
   printed size. Named, not asked for.
6. **[Residual evidence]** `npm run verify`'s `Test Files 71 / Tests 2063`, `warning lines=81 error lines=0`, the
   three `avatarUrl` mutations, and `vitest … 5 passed` are **builder-pasted**; my lane does not run the suite.
   The guards half of that paste I corroborated independently (`run-all.sh` → `GUARDS: PASS`, exit 0; guard check
   harness 93/93; `AGENTS.md` = 1789 words; the run twice identical).
7. **[Prose — no action]** The FR3 preamble's *"the correction is recorded here rather than argued"* leaves
   `slice-8a.md:662` (`MATCH (would have been GREEN)`) as written. Read as scoped ("measured against the round-1
   leg's view") the sentence is already true of leg 1, so nothing is hidden; recorded because this is the
   D-028 item-4 shape (a correction living in an appendix rather than in the sentence) the round blocked on for
   `:179` — there the sentence was false, here it is not.

---

## THE CLASS HUNT (D-025 / D-030) in what round 3 added

| round-3 surface | what it can come back empty/wrong as | consumed as |
|---|---|---|
| `checkRawBlockSummaries`'s `ranges === 0` (`:1579`) | the detector's pattern matched nothing in a **non-empty** scan | **disclosed note, claim omitted — DEFENSIBLE** (ADJUDICATION 5); verified both directions |
| `count === undefined` (`:1572`) | an out-of-table count word is **counted as checked** | **BLK-1 — a published claim over a comparison that never ran** |
| `blocks` (`:1545,1560,1579`) | the attribution heuristic misses live labels (3) and catches prose "verbatim" (≥1) | **BLK-2 — a coverage number read as coverage; nothing gates on it** |
| the early return (`:1403-1406`) | no reports under the root → the new rule does not run, and does not say so | PASS (registered hole, now covering a third rule) |
| the seed / mutation / control (`check.mjs:1202-1235`) | all three use in-table count words; the mutation's anchor is `:1572`'s whole disjunction | the trio is honest and CAN fail, but it is blind to BLK-1 — a check shaped so the hole is outside it (D-030's instance-4 lesson, at the new rule's own granularity) |
| the baseline re-derivation (FR3-4) | an emptied map that derived nothing would read as "0 keys lost" | **not reachable via the guard**: the size is printed from the map, and I re-derived the whole map — committed **435 keys / 669 occurrences**, derived **435 / 669**, `onlyCommitted 0`, `onlyDerived 0`, `countMismatch 0`; `emptied-map run` → **669 findings, `FAIL — 669 factory finding(s)`**, so the map cannot shrink green |
| the new `avatarUrl` ceiling (+ the two vectors) | a future edit adding a JSX-apostrophe desync or a regex literal changes what the leg measures | **declared**, with its absent-here measurement — the one place this round practised what it preaches |
| the §3 tombstone + the `:455` row | — | no measurement inside them; the row is verified (3 fields/4 pipes/2 escaped) and the tombstone's pointer resolves to a 13-line, one-per-line transcript with SEVEN zip legs |

**Claims the mechanism does not support, listed:** (a) the run's `N block(s) … read` as coverage (BLK-2);
(b) `N range summaries checked` for a skipped comparison (BLK-1); (c) the published claim
"every step-range summary … agrees with its own 'all N' count" over those skipped comparisons (BLK-1);
(d) FR3-1's *"the shape cannot produce this finding a fourth time"* without the near-variant named (BLK-2);
(e) the ceiling's "33,798 comment characters" without "non-whitespace" (NON-BLOCKING 1).
**Measurements that can come back empty and be consumed as health, listed:** `ranges === 0` (declared),
`count === undefined` (undeclared — BLK-1), `blocks === 0` (reported as coverage), the early return (registered,
widened). **Nothing in the round-3 `avatarUrl` surface can come back empty-and-green**: four `toBeGreaterThan(0)`
assertions before both legs, verified as present at `:133-139` / `:148-154`.

---

## REQUIREMENTS TRACEABILITY (round-3 remit)

| requirement | ruling | evidence |
|---|---|---|
| BLK: the fabricated `raw:` block DELETED | **MET** | diff removes 12 lines at `slice-8a.md:172`; nothing labelled `raw:` claims six legs; F3's replacement transcript holds 13 `✓` lines with seven zip legs (counted) |
| BLK: the SHAPE is a guard rule, and the rule fired on the LIVE defect | **MET** | pre-deletion corpus as the scan set → `11 block(s) … 1 range summary checked` + `FINDING … slice-8a.md:179 …`, identical to FR3-1's paste; a fabricated block re-introduced in a throwaway root → exit 1 with the same rule named |
| BLK: seed + mutation + control so the rule CAN fail | **MET in form** | `run-all.sh` → 93/93 (was 90: the check harness held **90** `check(` sites at `1c30d6a` and holds **93** now — the three the round added are the rule's own seed, mutation and control) — **but blind to BLK-1** |
| the route cannot recur a fourth time | **PARTIALLY MET** | common form: red gate (measured). Near-variants: label separated from its fence, indented block, out-of-table count word → green and silent (BLK-1, BLK-2) |
| the alias ceiling states what the mechanism does | **MET** | leg 1's own regex: both aliased callees false; both re-spelled arguments true |
| both false-pass vectors named, each with its measurement of absence; residual risk stated | **MET** | AST: 0 RegExpLiteral, 1 real `CallExpression` at `:1227`, 0 JSXText apostrophes; scanner vs source 33,798 chars, leak 0, over-blank 0; residual risk written into the docblock |
| the table row corrected | **MET** | `slice-8a.md:455`: 3 fields between 4 unescaped pipes, 2 escaped pipes |
| FR3-4's baseline numbers | **MET** | committed 435/669 = derived 435/669, no loss, no count moved; emptied-map run 669 findings; guard run twice, identical output |
| test delta zero; the round changed a docblock, not legs | **MET** | `avatarUrl.test.ts` in-range diff is 100% comment lines (0 non-comment `+`/`-` lines); no `e2e/` file in the range |
| the new rule's own zero case declared, not hidden | **PARTIALLY MET** | declared in the docblock and the run's note; the claim list omits it (verified both ways) — but the two counters beside it are not what they say (BLK-1, BLK-2) |
| scope: every changed line traces to the slice | **MET** | 10 files; the 4 non-builder files are orchestrator records (`.opencode/agents/orchestrator.md`, `plan.md`, `ledger.md`, `factory/work/v28-r2-8b.json`) and the two round-3 lane reports |

---

## RESIDUAL RISKS

- The test half of `npm run verify` (71 / 2063), the `vitest` count, and the three `avatarUrl` mutation outputs
  are builder-pasted. No verifier lane covers `7b72207`: the newest verifier record, `slice-8a-verify-3.md`,
  covers the round-3 **fix round's inputs**, not this tip.
- The rule's detector is one shape wide, by design; the escapes in BLK-2 are the shapes it does not read, and a
  fourth sighting written that way reaches a reviewer, not the gate.
- The gate reads a working tree other lanes are writing: one of my four guard runs exited 1 in the window when
  an orchestrator commit landed (`5abc1a4`, ledger-only), then exited 0 twice in a row with identical output.
- The label-set tripwire is a direction, not a spec: its fires on the live corpus (5 labels, 3 genuine blocks)
  mean the builder must decide, per label, to read it or disown it — that is the cost the note avoided.
- `lib-sibling-guard.sh`'s `checked=0` remains live and is 8b-owned; the `factory-guard.mjs:1403-1406` path
  remains live, is 8b-owned, and now covers three rules instead of two.

**Recommended next action (one line):** in `checkRawBlockSummaries`, make an unresolvable count word a finding (or
stop counting skipped comparisons as checked and stop publishing the claim for them), and either read the label
it already sees (tripwire price measured at 0/93 checks; 5 live labels, 3 of them real blocks) or put the 4-line
fence-attribution heuristic and the indented-block escape into the ceiling and stop printing the attribution
count as coverage — the route's two halves themselves I would sign off as they stand.
