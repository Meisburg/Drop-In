# Slice 8b — fresh-context review, ROUND 4

    Verdict: NEEDS_CHANGES
    Blocking findings:
      - factory-guard.check.mjs:307-313 — the GATE IS RED at HEAD (measured, this turn): `node scripts/guards/factory-guard.check.mjs` -> `1 check(s) failed — "an unacknowledged independence gap is CAUGHT — exit 0"`, so `bash scripts/guards/run-all.sh` prints `GUARDS: FAIL`, and the round-4 report's `RUNALL EXIT=0` / `checkers: factory-guard 137/137` (slice-8b.md:1045-1049) is not reproducible at this commit. Cause is one commit AFTER the reviewed range: c4a981d (D-034) registered a second model clearing the reviewer floor, and this check's failure mode requires only ONE qualified model — it mutates the LIVE registry (`REAL_CONFIG`, check.mjs:309-311), so the seed's world no longer exists and the check cannot fire. Not caused by the round-4 diff; it is a seed coupled to live data, in the harness the builder owns. MECHANISM, one line of repair.
    Non-blocking findings:
      - check.mjs:1572 + guard:160-175 — `ladder:`-class membership boundary, recorded not returned: the family is one DEFINITION (guard:176) with three call sites, but nothing enumerates the guard's `*_BASELINE` maps, so a fourth baseline added with a hand-rolled condition (or none) stays green. Boundary, not a mechanism gap: every other rule in this harness is covered by the same hand-list, and no fix round could enforce membership without inventing machinery for one family.
      - guard:1567 + guard:1895, guard:1604 + guard:1896 — the two `rawSummaryLines`-gate siblings round 4 did not extend to: `provenanceChecked = Boolean(repo)` and `transcriptsChecked` (a function whose only return is `true`, guard:1604) publish universals over ZERO measurements. Measured (exit 0): `0 provenance token(s) in the scan` AND `0 pasted transcripts` still prints both claims. Same class as round 3's NB-d, one granularity down.
      - slice-8b.md:773-775 — the round-2 paste still shows the old check name `✓ UNFORGEABILITY: …` and the words "makes the record unforgeable"; stale against the file it quotes (the harness now prints `NOT REACHABLE BY CONTENT`, check.mjs:1522/1540). Historical section, superseded by the round-4 section; no guard reaches check names in reports.
      - factory/decisions.md:944-948 — the over-claim c9530ab's message says it DELETED is still asserted in the ruling's own voice ("a fabricator cannot produce a baselined citation from a report"), nine lines above the correction that declares it false (over-claim `:947-948`, correction `:957`). Not the builder's lane (declared so in round 3); the orchestrator's commit c9530ab added a cross-reference instead of the deletion its message claims.
      - slice-8b.md:1090 — the `/tmp`-only derivation comparison (`ponytail:` in the artifact; the brief calls it `ladder:`): ceiling and upgrade path are named, and I re-derived the one NEW row myself, so it is recorded rather than returned.
    Requirements traceability:
      - BLK3 — one shared empty-record form over all three baselines -> met (guard:176, one definition; calls at :1553, :1564, :1829)
      - BLK3 — one check each and an exit-moving mutation each -> met (6/6 measured: three emptied maps exit 1 with the record's OWN message, three neutered calls exit 0)
      - BLK3 — the sharing is real, not three call sites that agree today -> met as a shared DEFINITION (the anchor is composed from the harness row and must occur exactly once, or `emptyMapCopy` throws); NOT met as enforced membership (nothing enumerates `*_BASELINE`) -> boundary, non-blocking
      - NB-a — blanket unforgeability claim gone from the harness -> met (the word survives only negated, check.mjs:1514)
      - NB-a — every surviving sentence matches the measured boundary -> met (re-measured: a fabrication at a recorded path exits 0, "1 of the 2 ABSORBED")
      - NB-b — the mid-line member named in the ceiling AND genuinely seeded -> met (guard:1666-1669; seed check.mjs:1634-1643; real guard exit 0, mutant exit 1 with the finding)
      - NB-c — the orphaned JSDoc returns to `mutatedGuard` as code -> met (check.mjs:90-99; `emptyMapCopy` keeps its own at :67-71)
      - NB-d — the range-claim gate gets a check, and the mutation honestly moves a claim not an exit code -> met, and it is NOT the batch's oldest finding (the mutation's difference is asserted in the mutant's output, and the property is also asserted against the real guard)
      - residual 1 — a `/tmp`-only derivation comparison, declared -> met (slice-8b.md:1090); the NEW row independently re-derived here: 2 keys / 10 occurrences, matching the committed map
      - residual 2 — the pre-existing indented contradiction at `.scratch/v28/reports/slice-8a-verify-4.md:122` -> met and verified (line 122 is the 4-space-indented `✓ 7–13 … (all six legs)`; declared at guard:1663-1665)
      - the numbers -> met (137 checks exist: 136 ✓ + 1 ✗ at HEAD; the baselines print exactly what slice-8b.md:1050-1052 pastes)
      - the gate at HEAD -> NOT met (the blocking finding)
    Recommended next action: repair check 13's seed so it no longer depends on the live registry (build the one-qualified-model world inside the fixture config), then re-run the gate; the round-4 diff itself is clean and needs no change.

**DISCLOSURE (required): I am a sibling model, not independent.** I was not the builder, but I share its model family, and the builder's report was handed to me as an input. Everything below that is not a measurement I ran in this turn is weak evidence; I mark what I ran. No repository file was modified: every probe built a throwaway root or a mutant copy under `/tmp`, and this report is the only file I wrote.

**Range.** `c9530ab..7c16e7a` — `scripts/guards/factory-guard.mjs`, `scripts/guards/factory-guard.check.mjs`, `.scratch/v28/reports/slice-8b.md`. Read first, as instructed: `.scratch/v28/reports/slice-8b-review-3.md`, the round-4 section of `slice-8b.md`, `factory/decisions.md` D-028/D-030/D-033. **Round 3's reference verdict is respected: the rule shape (D-032) was NOT re-opened — this round judged the family, not the rule.**

## What I ran (raw, this turn)

| command | result |
|---|---|
| `node scripts/guards/factory-guard.check.mjs` | **`1 check(s) failed — "an unacknowledged independence gap is CAUGHT — exit 0"`; 136 ✓ + 1 ✗ = 137 checks executed; EXIT=1** |
| `node scripts/guards/factory-guard.mjs` (committed state, repo root) | EXIT=0; `671 of the 671 … matched this scan (LOST COVERAGE 0)`; `670 fenced block(s) read, 2 range summaries checked`; `quotation baseline holds 2 recorded site(s)`; `174 provenance token(s) … 10 unresolvable`; `10 recorded unresolvable-sha record(s) absorbed` |
| three emptied maps (my `/tmp` probe, clean throwaway root, no `--repo`) | each **exit 1** with its own message: `the recorded baseline is EMPTY` / `the unresolvable-sha record is EMPTY` / `the quotation baseline is EMPTY`; in each case the record's own coverage note is **suppressed** |
| the same three with that record's call neutered (`if (false) {` on the exact call) | each **exit 0** — the verdict moves for all three |
| mid-line-marker seed, real guard | exit 0, block(s) read, **no finding** (fabricated line not compared) |
| mid-line-marker seed, mutant (`/.*(```|~~~)/` reads markers anywhere) | **exit 1** + `FINDING [transcript-summary-agrees]: .scratch/v28/reports/zz-raw.md:4: … covers 7 entries` — the boundary is what keeps it out |
| zero-range seed, real guard vs ungated mutant | real: exit 0, **no** `step-range-and-count` claim; mutant: exit 0 **with** the claim — the mutation's difference is real and is what the new check reads |
| a FABRICATION written AT a recorded path (`slice-8a-verify-5.md`) | **exit 0**, `1 of the 2 ABSORBED this scan (LOST COVERAGE 1)` — the declared boundary, re-measured at HEAD |
| re-derivation of the NEW row (emptied `UNRESOLVABLE_SHA_BASELINE` copy run over this repo, findings parsed) | **2 keys / 10 occurrences**, keys `slice-6c-fix-6-review.md::deadbee` ×9 and `slice-6c-fix-6-verify.md::deadbee` ×1 — equals the committed map and the builder's table row |
| qualified reviewer-floor models in `factory/config.json` at `7c16e7a` vs HEAD | **1 at 7c16e7a** (`ollama-cloud/deepseek-v4.1-flash:cloud`) → **2 at HEAD** (adds `ollama-cloud/glm-5.3`) — this is why check 13 died |
| `git rev-parse HEAD` / `git status --porcelain` | `c4a981d…` / clean — **HEAD is one commit past the reviewed range** |

I did not run `npm run verify`, any e2e spec, or the test suite. The report's Test Files/Tests/oxlint/AGENTS.md lines are specific and I take them as unverified-by-me; every guard-side line of its verify block I reproduced — except the gate, which is now red (above).

## Adjudication — one line each

- **BLK3 — HOLDS** (the instance class is closed, and closed the way round 3 prescribed): the empty-record decision is ONE definition (`factory-guard.mjs:176` `recordIsAbsorbable(check, record, size)`), used by all three baselines (`:1553`, `:1564`, `:1829`), with each note printed only inside that call, and each of the three now carries one seed and one exit-moving mutation whose verdict I measured `1 → 0` myself.
- **BLK3, "is the sharing real?" — YES as a shared definition, NO as enforced membership, and the difference is recorded rather than returned.** The three call sites do not "happen to agree": there is exactly one implementation of the emptiness test, the finding's wording is generated from the record label inside it, the note-suppression is bound to the same call, and the harness's mutation anchor is *composed from the row* (`check.mjs:1592`) and asserted to occur exactly once (`check.mjs:77-81`), so a renamed or missing call is loud, not silent. What is NOT enforced: nothing enumerates the guard's `*_BASELINE` maps, so a fourth baseline could be added unnoticed (`grep -n "_BASELINE" scripts/guards/factory-guard.check.mjs` returns only the three rows plus one unrelated anchor at `:1186`). That is a BOUNDARY of this harness's hand-list design — **not worth another round** (see the class hunt).
- **NB-a — HOLDS.** `grep -rni "unforgeab" scripts/` reaches nothing but the negation at `check.mjs:1514` ("so nothing here claims the record is unforgeable"); the heading and check name are `NOT REACHABLE BY CONTENT` (`:1510-1514`, `:1522`) and the mutation name now says "keeps a NEW path a finding" (`:1540`). Every surviving sentence matches the boundary I re-measured: a fabrication AT a recorded path is absorbed (exit 0), a NEW path quoting the same text fires.
- **NB-b — HOLDS, and as code rather than a sentence.** The member is named where the rule states its scope (`factory-guard.mjs:1666-1669`: "a fence marker with TEXT BEFORE IT on the line — a marker is read only at the start of a line, after leading whitespace") and seeded (`check.mjs:1634-1643`) with a detection mutation (`:1644-1653`); I measured both directions. The seeded shape is the one round 2/3 measured.
- **NB-c — HOLDS.** `check.mjs:90-99` — the `mutatedGuard` JSDoc is back above `mutatedGuard`, `emptyMapCopy` has its own docblock (`:67-71`); no sentence changed, which is what "as code" means here.
- **NB-d — HOLDS, and the claim/exit distinction is HONEST — it is not this batch's oldest finding.** The oldest finding (`slice-8b.md:430`) was a mutation that changed only the *printing* of a failure, so an exit-code check could not detect it and the mutation proved nothing. Here the check asserts the mutant's OUTPUT (`zeroRangeMiss.exit === 0 && /step-range-and-count line read/.test(zeroRangeMiss.out)`), and the difference the mutation produces is exactly the asserted text; the property is ALSO asserted against the real guard at zero ranges (`:1668-1672`, `!/step-range-and-count line read/`) with a control that makes the zero case non-vacuous (`:1674-1679`). I ran both sides: the real guard suppresses the claim, the mutant publishes it over zero comparisons. The builder declares the distinction in the report (slice-8b.md:1031-1033, 1080-1082) — that is a disclosure, not a dodge.
- **Residual 1 (`/tmp` derivation comparison) — honestly declared.** `slice-8b.md:1090` names it a `ponytail:` (the brief's word is `ladder:`; the artifact's label is `ponytail:`), says a future round must re-derive rather than trust the number, and says the committed maps remain the only absorber. I re-derived the row that is new this round (2 keys / 10 occurrences) rather than trusting it; it reproduces.
- **Residual 2 (`slice-8a-verify-4.md:122`) — honestly declared and verified.** Line 122 is the four-space-indented `    ✓ 7–13 zz-spec.e2e.ts (all six legs)` — a genuine range/count contradiction, outside the fenced scan set by the declared scope boundary; the guard's ceiling names the exact path and line and says "Declared, not hidden" (`:1663-1665`), and it is pre-existing (not introduced by round 4).

## BLOCKING FINDING

### BLK-R4 — [MECHANISM, out of range but blocking the gate] the harness is RED at HEAD, and the slice's own acceptance evidence no longer reproduces

    $ node scripts/guards/factory-guard.check.mjs
      ✗ an unacknowledged independence gap is CAUGHT — exit 0
    factory-guard check: 1 check(s) failed — the factory guard is not doing its job.   EXIT=1

136 checks pass; exactly one fails, and its failure is structural, not flaky:

    factory-guard.check.mjs:307-313
      const result = run((ctx) => {
        cleanRoot()(ctx)
        const config = JSON.parse(JSON.stringify(REAL_CONFIG))      // <-- the LIVE registry
        delete config.task_kinds.reviewer._independence_gap
        ctx.write('factory/config.json', config)
      })
      check('an unacknowledged independence gap is CAUGHT', result.exit === 1 && /independence-satisfiable/.test(result.out), …)

    factory-guard.mjs:284-290
      const qualified = Object.entries(config.models ?? {}).filter(([, m]) => gaps(m, floors).length === 0)
      if (qualified.length < 2 && !task._independence_gap) { fail('independence-satisfiable', …) }

The seed's failing world is "fewer than two models clear the reviewer floor". Measured this turn: that world existed at `7c16e7a` (one qualified model) and does not exist at HEAD (two: `deepseek-v4.1-flash:cloud`, `glm-5.3`), because c4a981d (D-034) registered the second one. So the guard correctly does not fire, and the check — which asserts `exit === 1` — goes red. `bash scripts/guards/run-all.sh` therefore ends `GUARDS: FAIL — 1 guard(s) reported findings: - factory-guard (behavior)`, and `.scratch/v28/reports/slice-8b.md:1045-1049` (`GUARDS: PASS`, `RUNALL EXIT=0`, `checkers: factory-guard 137/137 (was 130)`) is stale.

Attribution, stated plainly so it is not mis-charged: **this is not a defect of the round-4 diff.** The diff did not touch check 13, and the check was green when written (verified structure: 137 checks exist at `7c16e7a` too — 129 ✓ + 8 ✗ in a `.git`-less `git archive` copy, where those 8 are my environment's missing repository, not the repo's; and the config at `7c16e7a` had exactly one qualified model). It is the harness's *design* — a seed whose world is built by mutating the live registry — colliding with a sibling lane's commit. It is also D-030's own shape one level up: the registry changed, and the set that stopped being watched was the seed's reachability. The repair is inside the file the builder owns (construct the one-model world in the fixture config instead of depending on who is registered), which is why I return it as blocking rather than as a note to the orchestrator only.

**If the orchestrator rules this a separate work item, the round-4 diff is a PASS**: nothing in `c9530ab..7c16e7a` is wrong or incomplete.

## NON-BLOCKING FINDINGS

- **NB4-a [UNDER-DECLARED BOUNDARY, `ladder:` class, recorded not returned]** `factory-guard.check.mjs:1572` — *"a fourth record enters by adding a row, not by remembering a condition"* — and `factory-guard.mjs:160-175` — *"THE EMPTY-RECORD FINDING, IN ONE PLACE FOR EVERY RECORD … the decision lives here once"*. True of the loop's input and of the condition; but membership is a hand list, and **nothing enumerates the guard's baselines**: `grep -n "_BASELINE" scripts/guards/factory-guard.check.mjs` reaches the three rows (`:1576-1580`) and one unrelated anchor (`:1186`), and the guard's only occurrences are the three `new Map([` literals and their five uses. A fourth baseline added with a hand-rolled `if (size === 0)` — or with nothing — leaves the gate green. **Why this is a boundary and not a mechanism gap:** every other rule in this harness is covered the same way (a hand-listed seed), so demanding an enumerator for this one family would demand a property the file does not hold anywhere, and would not make membership automatic even then. **Why it is written down anyway:** the class has now been paid twice (two hand-written conditions in round 3, the third instance in round 4), so the sentence that describes the entry path should also say what is *not* enforced — the same treatment D-033 gave the path-occupancy half.
- **NB4-b [UNDER-DECLARED BOUNDARY / MECHANISM, small, same class as round 3's NB-d]** the two sibling claim gates the round-4 fix stopped one short of. Measured with a resolved repo and a corpus carrying no provenance sha and no pasted transcript (`node factory-guard.mjs --root <tmp> --repo <repo>`):

      note — count-provenance: 0 provenance token(s) in the scan, 0 distinct sha(s) resolved … — 0 unresolvable
      ok — … no count's provenance sha unresolvable beyond the recorded records (…) , every pasted provenance
           transcript that cites a `.scratch/` file still carries the sha it names (…)          EXIT=0

  The gates are `provenanceChecked = Boolean(repo)` (`guard:1567`, claim `:1895`) and `transcriptsChecked`, a value `checkTranscripts` returns as the constant `true` (`guard:1604`, claim `:1896`) — neither is "a check ran over something". The range claim was gated on `rawSummaryLines` and now has three checks (`check.mjs:1662-1688`); these two are still published over zero measurements, and the ceiling sentence at `guard:1676` ("the guard's claim list names only checks that ran") overstates for them. I am **recording** rather than returning this: round 3 filed this class as non-blocking, round 4 closed the instance it named, and a third payment of a non-blocking class is the ladder's warning — not a reason to hold the slice.
- **NB4-c [stale paste, low]** `.scratch/v28/reports/slice-8b.md:773-775` still prints `✓ UNFORGEABILITY: a NEW file quoting the SAME text still FIRES …` and *"what makes the record unforgeable"*. It is a round-2 paste of a round-2 run, superseded 230 lines later — but it now disagrees with the file it quotes (`check.mjs:1522`, `:1540`), and no rule reaches check names inside a report, so nothing else will notice it.
- **NB4-d [FALSE CLAIM, out of the builder's lane — for the orchestrator, and round 3's NB-e is NOT closed]** `factory/decisions.md:944-948`:

      … A **recorded baseline** is not: it is a map of `file::matched-text → count`, committed in the guard,
      and **a fabricator cannot produce a baselined citation from a report** — they would have to edit the guard,
      which is a reviewed diff.

  c9530ab's message says *"delete the over-claim rather than annotate it"*; the diff shows only a cross-reference added to list item 2, a typo fixed, and the BLK3 paragraph appended — **the over-claim sentence is still asserted, un-annotated, at the point of assertion**, nine lines above the correction that declares it false (over-claim `:947-948`, correction `:957-965`). Measured, it is false the way the correction says: a report that reuses a recorded path *can* produce a baselined citation (exit 0, absorbed). The builder declared it could not touch `factory/`; honest — but the fix that was supposed to close it did not.
- **NB4-e [recorded, not returned]** `slice-8b.md:1090` — the derivation comparison lives in a `/tmp` script. Declared, ceiling named, upgrade path named; I re-derived the new row independently, so it is not merely asserted.
- **NB4-f [recorded]** the unfenced ceiling's other examples (prose, a table cell, an inline code span) remain unseeded — they are the *same* mechanism as the two that are now seeded (no line-start marker → not a block start), so one boundary plus two seeds carries them. Accepted as declared.

## The class hunt (D-025, D-030) in what round 4 added — and "which set did I just stop watching?"

1. **The shared form (`guard:160-186`, `:1553`, `:1564`, `:1829`).** Claim: "the decision lives here once". Supported: one definition, three uses, no second copy of the condition anywhere (`grep -n "=== 0" factory-guard.mjs` returns only unrelated registry checks, `:237`, and the `blocks === 0` tripwire at `:1807`). No unsupported claim here.
2. **The harness loop over three records (`check.mjs:1576-1598`).** Claim: "for every record in the family" + "a fourth record enters by adding a row". Supported for the three rows and for the coupling (the mutation anchor is composed from the row and must occur once, `:77-81`); **not** supported as completeness of the family (NB4-a). This is the one place where a claim outruns the mechanism, and it is one sentence.
3. **The four restated clauses** (`check.mjs:1510-1514`, `:1522`, `:1540`; `guard:1666-1669`) — all four checked against measurement; each matches, and none now claims more than the mechanism keeps. The restatements did their job: `grep` finds no surviving blanket claim in the harness.
4. **The new seeds — can any come back empty and be consumed as health?** No: the three emptied-map seeds produce a FINDING (exit 1), each asserting the record's own message so an unrelated failure cannot make one green; the mid-line seed asserts the block count so a narrowed scan cannot hide; the zero-range seed asserts the claim's ABSENCE with a positive control beside it. **Sets round 4 stopped watching:** (a) the family's membership (NB4-a); (b) the two sibling claim gates `provenanceChecked`/`transcriptsChecked` (NB4-b) — the range gate was fixed, its siblings were not; (c) check 13's seed, killed by a registry change one commit later (the blocking finding).
5. **A claim the mechanism does not support, in the ruling doc:** `factory/decisions.md:944-948` (NB4-d).

## The verdict the supervisor asked for, plainly

**You said the rule was sound and the family was not uniform. The family is uniform now — the slice's guard work on `c9530ab..7c16e7a` is clean.** One shared empty-record form, three uses, three seeds, three exit-moving mutations, each note suppressed by the same call that files its finding; the shared form is a single definition rather than three implementations that agree, and the harness's mutation anchor is generated from the same row that names the record. Every finding round 3 returned on the diff is either met by measurement (BLK1/NB-a, BLK2/BLK3, NB1, NB2, NB3, NB4, NB5, NB6) or replaced by a measured check (NB-d).

**The ONE remaining thing is not the family's uniformity — it is the gate.** `factory-guard.check.mjs:307-313` is red at HEAD because its seed builds its failing world out of the live registry, and c4a981d changed the registry. Classify it as **MECHANISM** (a check whose failure mode can be destroyed by data in another file, repaired in the harness) — **not** as PROSE/BOUNDARY, and **not** as a defect of the reviewed diff. The membership boundary (NB4-a) is PROSE/BOUNDARY and is recorded here; it does not need a round.

## Requirements traceability

| requirement | status | evidence |
|---|---|---|
| BLK3 — one shared form over all three baselines | **met** | `factory-guard.mjs:176` (single definition), calls `:1553`, `:1564`, `:1829`; no other copy of the condition |
| BLK3 — one check each, one exit-moving mutation each | **met** | `check.mjs:1576-1598`; measured 3/3 emptied -> exit 1 with the record's own message, 3/3 neutered -> exit 0; harness 6/6 ✓ |
| BLK3 — the sharing is real, not three agreeing call sites | **met as a definition; not as enforced membership** | anchor composed from the row + uniqueness throw (`check.mjs:77-81`, `:1592`); nothing enumerates `*_BASELINE` (NB4-a, boundary) |
| BLK3 — the empty state cannot be printed over the record's own zero | **met** | notes printed only inside the call; emptied-map runs suppress their record's note |
| NB-a — the blanket claim is gone from the harness | **met** | `grep -rni unforgeab scripts/` -> only `check.mjs:1514` (negated) |
| NB-a — surviving sentences match the measured boundary | **met** | re-measured: fabrication at a recorded path -> exit 0, "1 of the 2 ABSORBED"; new path -> fires |
| NB-b — mid-line member declared and seeded | **met** | `guard:1666-1669`; seed `check.mjs:1634-1643`; mutation `:1644-1653`; both directions measured |
| NB-c — orphaned JSDoc fixed as code | **met** | `check.mjs:90-99` vs `:67-71` |
| NB-d — range-claim gate has a check; mutation honestly moves a claim | **met** | `check.mjs:1662-1688`; measured real-guard vs ungated mutant; not the `slice-8b.md:430` class |
| residual 1 — `/tmp`-only derivation comparison declared | **met** | `slice-8b.md:1090`; new row re-derived by me: 2 keys / 10 occurrences |
| residual 2 — indented contradiction at `slice-8a-verify-4.md:122` declared | **met** | `guard:1663-1665`; line verified (4-space indent, genuine contradiction, outside the scan set) |
| report numbers (137 checks; baselines as printed) | **met** | 137 executions at HEAD (136 ✓/1 ✗); real-repo run prints exactly `slice-8b.md:1050-1052` |
| report's gate claims (`RUNALL EXIT=0`, `137/137`) | **not met at HEAD** | blocking finding; true at `7c16e7a`, broken by c4a981d |
| round 4 touched no `factory/` file and no lane report | **met** | `git diff --stat c9530ab..7c16e7a` = the three files |

**DISCLOSURE, repeated:** sibling model, not independent. The measurements above are the evidence; the report's prose is an input I judged, not corroborated.
