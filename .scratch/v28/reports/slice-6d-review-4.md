# Slice 6d — FRESH-CONTEXT REVIEW, ROUND 4 (the fix-round-3 diff)

**Verdict: NEEDS_CHANGES**

**Reviewed range:** `git diff 4b9a8ef c70070a` (state judged in round 3 = `4b9a8ef`; the fix = `ad817cc` + `c70070a`).
`git diff --name-status 4b9a8ef c70070a` returns nine files: `.scratch/v28/ledger.md`,
`.scratch/v28/reports/slice-6d-review-3.md`, `.scratch/v28/reports/slice-6d-verify-3.md`,
`.scratch/v28/reports/slice-6d.md`, `factory/decisions.md`, `factory/work/v28-r2-6d.json`,
`scripts/guards/copy-taxonomy-guard.check.mjs`, `scripts/guards/copy-taxonomy-guard.mjs`,
`scripts/guards/factory-guard.mjs`. All nine are judged here, including `factory/decisions.md` (it was the *base*
last round and is in the range this round).

**DISCLOSURE (required, D-007/D-015): I am a sibling model, not an independent one.** Same model family as the
builder. Every factual sentence below carries the command I ran inline so it can be re-checked without trusting me.
I did **not** run `npm run verify` (my shell does not run the suite): that gate row is **attested, not reproduced**,
and I say so rather than paraphrasing it as mine. `node`, the guards, the check, `npx oxlint` and `diff` I did run.

---

## 0a. What I ran (raw, this round)

| command | result |
|---|---|
| `node scripts/guards/copy-taxonomy-guard.mjs` | **exit 0**, `scanned words: 9 (…)`, `declared claims CHECKED by rule 3: 3 of 3 the taxonomy accepts` |
| `node scripts/guards/copy-taxonomy-guard.check.mjs` | **exit 0**, `all 29 checks passed, 0 failed, across 26 guard invocations (8 of them against a mutated copy of the guard)` |
| `npx oxlint scripts/guards/copy-taxonomy-guard.mjs scripts/guards/copy-taxonomy-guard.check.mjs` | no output, **exit 0** |
| `node scripts/guards/factory-guard.mjs` | **exit 0**, `no-bare-head-count: baseline holds 646 recorded occurrence(s)` |
| `bash scripts/guards/run-all.sh` | **exit 0**, `GUARDS: PASS — all deterministic rules hold.` |
| `diff <(sed -n '109,127p' .scratch/v28/reports/slice-6d.md) <(node scripts/guards/copy-taxonomy-guard.mjs)` | no output → **`SEC2_IDENTICAL_BYTE_FOR_BYTE`** |
| five throwaway trees under `/tmp/rev4` (park+indoor_play sharing one word; six NON-declared kinds collapsed; a declared `beach` made unscannable; `PLACE_KINDS` emptied; every word collapsed) | see §0c/§0d |
| a copy of the guard with `claimsAccepted += 1` moved above the rule-1 branch, run through `COPY_TAXONOMY_GUARD_UNDER_TEST=… node …check.mjs` | check goes **red** (1 failed) — the zoo seed really does pin the denominator |
| a copy of `factory-guard.mjs` with the four round-3 baseline entries deleted, `--root <repo>` | **`FAIL — 4 factory finding(s)`**, baseline `642` — the four entries are exactly the four observed occurrences |

---

## 0b. The adjudications, one line each

- **F3a — HOLDS (deletion loses nothing observable).** `grep -n "ambiguousWords" scripts/guards/copy-taxonomy-guard.mjs ; echo exit=$?` → `exit=1`, and no consumer existed at `a6d72f6` either (`git show a6d72f6:scripts/guards/copy-taxonomy-guard.mjs | grep -c ambiguousWords` → `2`, declaration + push, no reader). The observable information survives per **kind**: with `park` and `indoor_play` both returning `'Park'`, `/tmp/rev4/A` prints
  `limit—— kind "park" is not scannable: its word "Park" is the label of 2 kinds (park, indoor_play), so a match could not be attributed to it (see WHERE IT STOPS in the header)` and the same line for `indoor_play` — the word AND the full owner list, twice. Nothing a reader could see before is gone; only a dead array and a false reason about it are.
- **F3b — HOLDS (the counter is genuinely read, not printed).** `guard.mjs:515` `if (claimsChecked < claimsAccepted) {` is the tripwire; the print is at `:502`. Removal is falsifiable: my mutated guard (denominator including the rule-1-absent kind) makes the zoo seed's own mutation stop clearing, `✗ … — MUTATION: dropping the rule lets that seed PASS … — exit 1: - 1 declared claim(s) … — .`, `1 check(s) failed`. A merely-printed variable could not do that.
- **F1 — HOLDS (deleted, not restated).** *the guard prints a `limit——` line per such kind, NAMING WHICH of the three applies* (`guard.mjs:60`) — `git diff 4b9a8ef c70070a -- scripts/guards/copy-taxonomy-guard.mjs` shows `-…per such kind or per shared word,` / `+…per such kind,`. Nothing new and untrue took its place — except that this diff's own evidence for the deletion does not reproduce (§0e, B1).
- **F2 — HOLDS (the row is about the thing now, and its reason is real).** `slice-6d.md:822` says *each affected KIND prints a limit line naming the shared word and its owners*; `/tmp/rev4/A` prints exactly that for both kinds and no per-word line. The dead variable's name is out of the row.
- **F4 — HOLDS (the ordering claim is gone, the consequence is true).** `slice-6d.md:803-804` now says *BOTH tripwires fire*. Every word collapsed → `node scripts/guards/copy-taxonomy-guard.mjs /tmp/rev4/ALL` → `declared claims CHECKED by rule 3: 0 of 3` and `FAIL — 2 finding(s):` (scan finding first, counter second), `EXIT_ALL=1`. `check.mjs:470` removes both, so the seed's mutation does remove both. No ordering claim remains.
- **F6 — HOLDS (own case named; the denominator excludes it so rule 1 keeps the defect).** On `/tmp/rev4/Z` (`TOUR_TAXONOMY_CLAIMS = ['playground','pool','beach','zoo']`): `declared claims: 4 (playground, pool, beach, zoo)`, then `limit—— src/lib/firstRunTour.ts: the declared kind "zoo" is not scannable: the taxonomy has no kind "zoo" at all, which is rule 1's finding, so rule 3 has nothing to check`, then `declared claims CHECKED by rule 3: 3 of 3 the taxonomy accepts`, `FAIL — 1 finding(s): - …the declaration names the category "zoo", which PLACE_KINDS does not have…`. `guard.mjs:465` increments the denominator *after* the `continue` at `:463`, and the zoo seed's mutation (which clears only rule 1's `missing` filter) still exits 0 — see the red-check experiment above. One caveat, filed as N1 below: the clause *which is rule 1's finding* is false in one state.

---

## 0c. §14's boundary list, audited line by line (`slice-6d.md:951-968`)

**1. "the sets its own diff touched" — REAL, ACCURATE.** `ambiguousWords` is the proof and it is verifiable: `git show a6d72f6:scripts/guards/copy-taxonomy-guard.mjs | grep -n ambiguousWords` → `318/336` (declared, pushed), no reader; the round-2 revision of that row (`slice-6d.md:821`) certified that row as watched. The description — the sweep enumerated the path and did not re-read what round 2's edits had changed — matches the artifact.

**2. "the check's internal sets beyond its seed premises" — REAL GAP, ONE NAME DOES NOT RESOLVE.** The gap is real: `pristine` (`check.mjs:116,122,125`), `guardRuns` (`:100,157,503`) and `mutationRuns` (`:101,234,424,475,504`) are printed or used for restoring, and no check asserts them. But `extras` is not in this file at any revision: `grep -in "extra" scripts/guards/copy-taxonomy-guard.check.mjs` → nothing, `git log --all -S"extras" -- scripts/guards/copy-taxonomy-guard.check.mjs` → nothing, while `grep -rn "extras" scripts/` → `scripts/guards/copy-field-consumption-guard.check.mjs:289`. It is another instrument's set, listed under *this* check's heading. **FALSE CLAIM — B2.**

**3. "other instruments' sets" — REAL GAP, WRONG COUNT, AND IT EXEMPTS A SET THIS DIFF TOUCHED.** `grep -n "new Map(" scripts/guards/factory-guard.mjs` → `BARE_HEAD_BASELINE` (`:858`) and `UNRESOLVABLE_SHA_BASELINE` (`:1306`) — **two** baselines, not three (`:1378-1387` are per-run working maps, not baselines; `grep -n "baseline" scripts/guards/factory-guard.mjs | grep -iv "BARE_HEAD\|UNRESOLVABLE"` adds only the regex `BASELINE_NUMBER_CLAIM` at `:397`). The copy-field guard's `shapes` Map (`copy-field-consumption-guard.mjs:529`, printed at `:814`) is fair to call a shape table. Separately, this diff's own edit touched `BARE_HEAD_BASELINE` (four entries added, `factory-guard.mjs:1288-1291`), so D-030's rule applied to it: it *was* re-read, and the claim is true — deleting the four entries yields `FAIL — 4 factory finding(s)`, all in `slice-6d-verify-3.md` with exactly the four recorded texts, baseline `642` (= 646 − 4). **WRONG NUMBER — B3.**

**4. "coverage, not emptiness" — REAL, ACCURATE, AND REPRODUCED.** On `/tmp/rev4/B` (the six NON-declared kinds collapsed onto one shared word, the three DECLARED ones left scannable): `scanned words: 3 (Playground, Pool, Beach)`, six `limit—— kind …` lines naming the word and all six owners, `declared claims CHECKED by rule 3: 3 of 3 the taxonomy accepts`, `PASS — …`, `EXIT_B=0`. The claim is exact, including the quoted string and the PASS. **Is leaving it DECLARED defensible here?** Yes, and I would not return it as a tripwire request: (a) a shared word is a *declared-legitimate* taxonomy shape — `guard.mjs:55-57` names it as one of the three unattributable reasons — so a tripwire on shared words would contradict the header; (b) any threshold on `kindsByLabel.size` vs `allKindSet.size` is false today on the clean tree (`kinds read: 10`, `scanned words: 9`, `other` legitimately unscannable); (c) the gap is printed, per kind, naming the word and its owners, and the two numbers a reader needs (`kinds read: 10`, `scanned words: 3`) are both printed. It is *not* the next instance of D-030, because nothing came back empty and nothing was read as health — the coverage reduction is stated in the run's own output. The residual asymmetry is worth recording, not fixing here: rule 3 now has a positive printed ratio (`CHECKED by rule 3: N of M`) and rule 4 has none, so rule 4's coverage is visible only if the reader subtracts `scanned words` from `kinds read`.

**5. "anything downstream of the exit code" — REAL BUT OVERSTATED.** The gap is real, and this round is its evidence (the ledger sha below). The justification *"a guard cannot watch what reads it"* is too strong for this repo: `factory-guard.mjs:1356` scans `.scratch/v28/reports` and `.scratch/v28/briefs` and polices their prose (bare-HEAD counts, count provenance, pasted transcripts). The honest, narrower boundary is *the ledger, the work item and this guard's own report are outside factory-guard's scan root*. **UNDER-DECLARED BOUNDARY — N2.**

---

## 0d. The counter's own edges

- **`claimsAccepted === 0`:** something still fails, but not the counter. On `/tmp/rev4/D` (`PLACE_KINDS` emptied): `declared claims: 3 (playground, pool, beach)` then `declared claims CHECKED by rule 3: 0 of 0 the taxonomy accepts`, `FAIL — 2 finding(s)`: the taxonomy-walk finding and the scan-set tripwire — the claim counter is **silent** (`guard.mjs:515` `0 < 0` is false). Three declared claims went unchecked and the run's claim counters say nothing; only `guard.mjs:279` and `:508` carry the state. **No silent pass** (exit 1), so non-blocking — but it is D-030's exact shape for the counter itself, and §14's boundary list does not name it (item 4 is "coverage, not emptiness"). **UNDER-DECLARED BOUNDARY — N3.**
- **A declared claim unscannable:** `/tmp/rev4/C` (the `beach` case deleted) → `limit—— …the declared kind "beach" is not scannable, so rule 3 does not check its claim (its word is the label function default…`, `declared claims CHECKED by rule 3: 2 of 3 the taxonomy accepts`, `1 declared claim(s) … could not be CHECKED by rule 3 — src/lib/firstRunTour.ts claims "beach"`, `REAL_EXIT_C=1`. **N < M and exit 1 — as claimed.**
- **Can any path consume the counter as health?** No. `grep -n "claimsAccepted\|claimsChecked" scripts/guards/copy-taxonomy-guard.mjs` returns only the declarations (`:366-367`), the increments (`:465`, `:474`), the print (`:502`) and the tripwire (`:515`). The nearest health-shaped artifact is the printed `0 of 0` pair above, which is a print, not a verdict.
- **Two accumulators, one measurement, no assertion tying them:** the finding's *number* is computed from the counters (`guard.mjs:517`, `claimsAccepted - claimsChecked`) while its *names* come from a second array (`:518`, `claimsUnchecked`). In the shipped guard they cannot diverge (both updated in the same branch at `:467-474`), but nothing pins that they agree — my mutated guard produced `1 declared claim(s) … could not be CHECKED by rule 3 — .` with an empty name list. **MECHANISM — N4.**

---

## 0e. The set round 3 stopped watching (D-030's own rule, applied to this diff)

The diff, `git diff 4b9a8ef c70070a -- scripts/guards/copy-taxonomy-guard.mjs`, touched exactly these sets:
`ambiguousWords` (deleted), `kindsByWord`/`unattributableKinds` (unchanged logic), `claimsAccepted` (new),
`claimsChecked` (re-pointed), `claimsUnchecked` (unchanged), and the rule-1 `missing` filter (`:431`, unchanged)
*whose subject the new branch at `:454-464` now also enumerates*.

- `ambiguousWords` — **nothing observable stopped being watched**, per F3a above: the per-kind line carries the word and the owners.
- **The new denominator's own emptiness is unwatched** (`guard.mjs:465` + `:515`, reproduced on `/tmp/rev4/D`). File:line: `scripts/guards/copy-taxonomy-guard.mjs:515-521`.
- **The rule-1-owned set is watched by two different owners depending on state.** `guard.mjs:431` suppresses rule 1's subject exactly when `allKindSet.size === 0`, while the new branch at `:454-464` prints *which is rule 1's finding* unconditionally. On `/tmp/rev4/D` the printed reason names a finding that does not exist. File:line: `scripts/guards/copy-taxonomy-guard.mjs:459-461` vs `:431`. **MECHANISM/FALSE CLAIM — N1.**
- **The new printed pair is pinned by nothing.** `grep -n "CHECKED" scripts/guards/copy-taxonomy-guard.check.mjs` hits only `:412` (the B2b finding fragment); the clean-run check asserts the other printed counters (`check.mjs:250-264`) but not `guard.mjs:502`. §14's "**no new check**, so no new mutation was owed" is true of the *rule* and leaves the round's new printed line with no assertion. **MECHANISM — N5.**

---

## 0f. Findings

**B1 — `ladder:` FALSE CLAIM (blocking).** `slice-6d.md:924-925` pastes
`$ grep -n "per shared word\|printed per word\|fires before" scripts/guards/copy-taxonomy-guard.mjs .scratch/v28/reports/slice-6d.md ; echo exit=$?` with the result `exit=1`. Re-running it verbatim gives **exit 0** with four hits — `slice-6d.md:916`, `:918`, `:920` (three of them §14's own prose, quoting the clauses it deleted) and `:924` (the pasted command line itself, which contains the three patterns). The claim is not merely stale, it is **unachievable**: the transcript's own text guarantees a match, so this evidence block can never confirm F1/F2/F4's deletion. It is the round's proof that the three clauses were deleted, and the round is the one that refreshed §2's pasted run (`SEC2_IDENTICAL_BYTE_FOR_BYTE`) and left this one un-re-run.

**B2 — FALSE CLAIM (blocking).** `slice-6d.md:956` names `extras` as one of "the check's internal sets". It is not in that check at any revision (`grep -in "extra" scripts/guards/copy-taxonomy-guard.check.mjs` → nothing; `git log --all -S"extras" -- scripts/guards/copy-taxonomy-guard.check.mjs` → nothing). It is `scripts/guards/copy-field-consumption-guard.check.mjs:289`. The boundary list's whole function is that its names resolve; this one points at another instrument from inside this heading.

**B3 — WRONG NUMBER (blocking).** `slice-6d.md:959` says "`factory-guard`'s three baselines". `grep -n "new Map(" scripts/guards/factory-guard.mjs` gives `BARE_HEAD_BASELINE` (`:858`) and `UNRESOLVABLE_SHA_BASELINE` (`:1306`) — two. A boundary list that miscounts the sets it declares unwatched is the class the list exists to prevent.

**N1 — FALSE CLAIM (non-blocking).** `scripts/guards/copy-taxonomy-guard.mjs:459-461` — the clause `which is rule 1's finding` added by this diff — is false whenever `allKindSet.size === 0`, because rule 1's subject is suppressed there (`:431`). Reproduced on `/tmp/rev4/D`: the three declared kinds each print `…which is rule 1's finding…`, and the run's findings are the taxonomy-walk one and the scan tripwire — no rule-1 finding names a kind. The run still fails, so non-blocking; it is the same "printed reason that is not the real one" the header calls a defect (`:61-62`), one narrow notch down.

**N2 — UNDER-DECLARED BOUNDARY (non-blocking).** `slice-6d.md:966-967` justifies item 5 with *"A guard cannot watch what reads it"*. `factory-guard.mjs:1356` scans `.scratch/v28/reports` and `briefs` and polices their prose (bare-HEAD counts, count provenance, pasted transcripts), so the true boundary is narrower: *the ledger, the work item and this guard's own report are outside that scan root*.

**N3 — UNDER-DECLARED BOUNDARY (non-blocking).** The counter's own subject can come back empty (`claimsAccepted === 0`, `guard.mjs:515` silent, printed pair `0 of 0`) while three declared claims were read — `/tmp/rev4/D`. §14's boundary list does not name it. No silent pass, so the severity is the list's completeness, not the exit code.

**N4 — MECHANISM (non-blocking).** The counter's number (`guard.mjs:517`) and its names (`:518`) come from two accumulators and nothing asserts `claimsAccepted === claimsChecked + claimsUnchecked.length`. Evidence: my mutated guard emits `1 declared claim(s) … could not be CHECKED by rule 3 — .` — a finding whose count is right and whose name list is empty. Unreachable in the shipped guard, unpinned by the check.

**N5 — MECHANISM (non-blocking).** The round's new printed line (`guard.mjs:502`) is asserted by no check (`grep -n "CHECKED" scripts/guards/copy-taxonomy-guard.check.mjs` → `:412` only), while the counters printed beside it are pinned (`check.mjs:250-264`).

**N6 — `ladder:` FALSE CLAIM (non-blocking, third landing in D-030's own entry).** `factory/decisions.md:856-860` says the two counting defects are *"**deleted, not corrected**"*, and `ledger.md:7216` says *"Fixed by deletion per D-028"* — but `git diff 4b9a8ef c70070a -- factory/decisions.md` shows the heading **corrected**: `-…(three instances, now a named class)` / `+…(four instances, now a named class)`. Either the paragraph misdescribes the fix it accompanies, or the heading is a typed count of a table it can point at — which the same paragraph's own standard ("counts nothing it cannot see") and `factory-guard`'s `BASELINE_NUMBER_CLAIM` (`:397-499`) both reject. The entry about written claims the artifact does not support now carries one.

**N7 — FALSE CLAIM (non-blocking).** `ledger.md:7214` cites `262206ea` for the round-3 dispatch: `git cat-file -e 262206ea^{commit}` → `fatal: Not a valid object name`. The ledger is outside every instrument's scan (`factory-guard.mjs:1356` covers `.scratch/v28/reports` and `briefs` only), which is N2's narrower boundary stated as fact.

**N8 — FALSE CLAIM (non-blocking, two instances of readership over-claim).** `slice-6d.md:903-904` says `claimsUnchecked` is read "by the finding's list **and by the per-kind line**"; `grep -n "claimsUnchecked" scripts/guards/copy-taxonomy-guard.mjs` returns `:368` (declaration), `:467` (push), `:518` (the finding's list) — the per-kind line reads `whyUnattributable` (`:470`). And `slice-6d.md:978-979` describes the check name at `check.mjs:478` as saying only that *both* were removed, while the name also asserts *"the two are one invariant at two granularities"* — which §14's own preceding sentence calls a structural claim the verifier's measurement does not support.

---

## 0g. Requirements traceability (the fix-round-3 claims, `slice-6d.md` §14)

| claim in §14 | status | evidence |
|---|---|---|
| F3: `ambiguousWords` DELETED, nothing observable lost | **met** | `grep -n ambiguousWords guard.mjs` → `exit=1`; `/tmp/rev4/A` prints the word and both owners per kind |
| F3: `claimsChecked` WIRED as the tripwire's subject, not merely printed | **met** | `guard.mjs:515`; mutated-denominator guard → check red |
| F3: the zoo seed asserts the line *and* the accounting | **met** | `check.mjs:281-294`; counting the rule-1-absent kind in the denominator is fatal to that seed's mutation (red-check above) |
| F1/F2/F4: three clauses deleted rather than restated | **met** | `guard.mjs:60`, `slice-6d.md:803-804`, `:822`; `git diff` shows the clauses removed, replacements verified by run |
| F1/F2/F4: the evidence for the deletion | **not met** | B1: `slice-6d.md:924-925` claims `exit=1`, returns `exit=0` |
| F6: absent kind prints its own case; denominator excludes it so rule 1 owns the defect | **met** | `/tmp/rev4/Z`: own-case limit line, `3 of 3`, one rule-1 finding |
| the sweep held under attack (8 of 13 rows falsified) | **met where reproducible** | `/tmp/rev4/A`, `/tmp/rev4/B`, `/tmp/rev4/ALL`, `PLACE_KINDS` empty, `TOUR_TAXONOMY_CLAIMS` emptied all behaved as the table claims |
| §14 boundary items 1 and 4 | **met** | item 1 verified by `git show a6d72f6`; item 4 reproduced byte-exactly |
| §14 boundary items 2, 3, 5 | **partially met** | B2 (`extras`), B3 (three baselines), N2 (overstated "cannot") |
| §14 boundary list is complete | **not met** | N3: the counter's empty denominator is not named |
| gate numbers (guard 0; check 29/26/8; run-all PASS; oxlint silent; no test delta) | **met** | all reproduced above; `git diff --name-status 4b9a8ef c70070a` touches no `.test.mjs` |
| §2's pasted run refreshed and compared verbatim | **met** | `diff` → `SEC2_IDENTICAL_BYTE_FOR_BYTE` |
| the four new `no-bare-head-count` findings, new 4 / lost 0 / decreased 0 | **met** | stripped-baseline `factory-guard` → `FAIL — 4 factory finding(s)`, baseline `642`, all four in `slice-6d-verify-3.md`; `grep -n HEAD .scratch/v28/reports/slice-6d-review-3.md` → exit 1 |
| `npm run verify` exit 0, 71 files / 2068 tests | **attested, not reproduced** | my shell does not run the suite; §14 labels nothing about it falsely |

## 0h. Honesty check

Every mechanism number in §14 that I could execute is right: the `29/26/8` check summary, the `3 of 3` pair, the
`0 of 3` collapse pair, the zoo block verbatim, the two-orphan deletion, the four baseline entries and their
derivation, §2's run, and the mutation-anchor discipline (`mutate()` really does refuse a non-unique anchor —
`grep -n "!allKindSet.has(kind)" guard.mjs` → `2`). The deviations are all prose: one un-re-runnable evidence
block, one non-resolving set name, one wrong count in the boundary list, and the N1/N6/N7/N8 claims above. The
mechanisms the round was asked to fix are fixed.

## 1. Recommended next action

One prose-and-pin pass, no mechanism rewrite: re-run and re-paste (or delete) the §14 transcript (B1); delete the
`extras` name and the "three" count from the boundary list (B2, B3); delete the `which is rule 1's finding` clause
or make it conditional on `allKindSet.size > 0` (N1); add the counter's empty denominator to the boundary list
(N3); and correct the two lane-record claims (N6, N7) — the mechanisms themselves hold.

**Ladder note (D-025/D-030).** B1, B2, N6 and N8 are the same class this slice has now paid four times: a written
claim the artifact does not support, found in the text the round *added* while fixing that class. B1 in particular
is mechanically catchable (a pasted command whose own text contains its own pattern is a one-line assertion, and
`factory-guard`'s existing transcript rule at `factory-guard.mjs:1454` already reads that family of lines), so the
next rung is a guard on pasted transcripts' reproducibility rather than a fifth hand sweep. The mechanisms are
converged; the prose is not, which is why this round returns NEEDS_CHANGES on text alone.
