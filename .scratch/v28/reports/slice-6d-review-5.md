# Slice 6d — FRESH-CONTEXT REVIEW, ROUND 5 (FINAL)

**Verdict: NEEDS_CHANGES** — the mechanism is clean and four of the five adjudication targets hold completely
(B1, N1, N4/N5, N8); B2/B3's two wrong items are gone, but one clause of the boundary list that replaced them
(the round's own deliverable) is a claim the mechanism contradicts, plus three smaller written claims the round
added or left. **No MECHANISM defect anywhere.** Every fix here is a one-line prose edit; nothing I found
justifies a sixth round.

**Reviewed range:** `git diff --name-status a953db0 0bcd132` → eight files: `.scratch/v28/ledger.md`,
`.scratch/v28/reports/slice-6d-review-4.md` (A), `.scratch/v28/reports/slice-6d-verify-4.md` (A),
`.scratch/v28/reports/slice-6d.md`, `factory/decisions.md`, `scripts/guards/copy-taxonomy-guard.check.mjs`,
`scripts/guards/copy-taxonomy-guard.mjs`, `scripts/guards/factory-guard.mjs`. `git diff --name-status a953db0
0bcd132 | grep -c test.mjs` → `0`: no vitest file is touched.

**DISCLOSURE (required, D-007/D-015): I am a sibling model, not an independent one** — same model family as the
builder and as the earlier reviewers of this slice. Every factual sentence below carries the command that
produced it. I did **not** run `npm run verify` (my shell does not run the suite): §15's suite rows are
**attested, not reproduced**, and I say so rather than adopting them. `node`, the guards, the check,
`npx oxlint`, `git`, `diff`, `wc` and `python3` I did run.

---

**Return format, compact:**

**Verdict:** NEEDS_CHANGES — mechanism clean; one prose clause of the reduced boundary is false.

**Blocking findings:**
  - `.scratch/v28/reports/slice-6d.md:949` (F2) — the reduced boundary's middle item, "**the instruments' own
    counters**, whose emptiness is a print rather than a verdict", is FALSE of the guard's counters: they are
    five tripwires (`scripts/guards/copy-taxonomy-guard.mjs:508`, `:515`, `:523`, `:526`, `:529`) and covered
    rows of §13's own sweep table (`.scratch/v28/reports/slice-6d.md:818`, `:819`). PROSE-class, one clause, no
    mechanism change.

**Non-blocking findings:**
  - `scripts/guards/copy-taxonomy-guard.mjs:460-461` (F1) — `ladder:` the shortened limit line ("the taxonomy
    has no kind … at all") is unsupported when the walk is empty for a reason other than absence
    (`/tmp/rev5/R`); exit 1 in that state, so no health is consumed.
  - `.scratch/v28/reports/slice-6d.md:997` (F5) — `ladder:` "rule 1 owns it" is false in the very state it
    describes; the same claim lives at `:800`, `ledger.md:7218`, `check.mjs:290`.
  - `factory/decisions.md:855-856` + `.scratch/v28/ledger.md:7223` (F4) — `ladder:` "wrong, and wrong again the
    moment a row was added" overstates by one; the draft's count was right.
  - `factory/decisions.md:857` (F3) — `ladder:` "this entry now counts nothing" while `:852`/`:828` count.

**Requirements traceability:** §6 below (criteria -> met / not met, with evidence).

**Recommended next action:** one prose pass — scope `slice-6d.md:949` to the check's own run counters (F2), hedge
`guard.mjs:460-461` to describe the walk (F1), delete "rule 1 owns it" (`:997`, F5), delete "and wrong again"
(`decisions.md:855-856`, `ledger.md:7223`, F4), one word on `decisions.md:857` (F3). No sixth round.

---

## §0 What I ran (raw, this round)

| command | result |
|---|---|
| `node scripts/guards/copy-taxonomy-guard.mjs` | **exit 0** — `scanned words: 9`, `declared claims CHECKED by rule 3: 3 of 3 the taxonomy accepts`, `PASS …` |
| `node scripts/guards/copy-taxonomy-guard.check.mjs` | **exit 0** — `all 29 checks passed, 0 failed, across 26 guard invocations (8 of them against a mutated copy of the guard)` |
| `bash scripts/guards/run-all.sh` | **exit 0** — `GUARDS: PASS — all deterministic rules hold.` |
| `node scripts/guards/factory-guard.mjs` | **exit 0** — `baseline holds 647 recorded occurrence(s)`; `0 untracked, 0 tracked-but-absent` |
| `npx oxlint scripts/guards/copy-taxonomy-guard.mjs scripts/guards/copy-taxonomy-guard.check.mjs scripts/guards/factory-guard.mjs` | no output, **exit 0** |
| `grep -n "per shared word\|printed per word\|fires before" scripts/guards/copy-taxonomy-guard.mjs ; echo exit=$?` | `exit=1` — B1's replacement command, re-run from the report verbatim |
| `grep -rn "rule 1" scripts/guards/copy-taxonomy-guard.mjs` | no output — the guard file no longer makes that claim anywhere |
| `diff <(sed -n '109,127p' .scratch/v28/reports/slice-6d.md) <(node scripts/guards/copy-taxonomy-guard.mjs)` | no output → §2's pasted run is still byte-identical to a live run |
| `git show a953db0:….md \| sed -n '879,1006p' \| wc -w` / `git show 0bcd132:….md \| sed -n '879,992p' \| wc -w` | **1615 / 1465** — see §2 |
| `/tmp/rev5/D` — `PLACE_KINDS` emptied | **exit 1**, `FAIL — 2 finding(s)`; `grep -n "rule 1" /tmp/rev5/D.out` → exit 1 |
| `/tmp/rev5/Z` — `'zoo'` added to the declaration | §14's F6 paste reproduced verbatim |
| `/tmp/rev5/R` — `PLACE_KINDS` renamed | the limit line prints a claim the file it read contradicts (F1) |
| `/tmp/rev5/B` — the six NON-declared kinds collapsed onto one word | `scanned words: 3 (Playground, Pool, Beach)`, six `limit——` lines, `PASS`, **exit 0** |
| `/tmp/rev5/P` — a guard copy with the printed pair's `console.log` deleted | the check goes red on **2** checks, exit 1 |
| `/tmp/rev5/N` — a guard copy with `claimsUnchecked.push` deleted | the check goes red on **1** check, printing `…could not be CHECKED by rule 3 — .` |
| a copy of `factory-guard.mjs` with one diagnostic inserted over the bare-head scan's own `seen` map | `DIAG bare-head baseline keys never matched: 0 of 417` |

All throwaway trees are copies of `src/` under `/tmp/rev5/`, driven by the shipped guard with a repo-root
argument (`node scripts/guards/copy-taxonomy-guard.mjs /tmp/rev5/D`); the two check mutants were driven through
the check's own `COPY_TAXONOMY_GUARD_UNDER_TEST` seam, placed at the same depth as the shipped guard so its
`../../src/lib/escapeForRegExp.mjs` import resolves.

---

## §1 The adjudications, one line each

- **B1 — HOLDS.** The self-invalidating transcript is gone (`git diff a953db0 0bcd132 --
  .scratch/v28/reports/slice-6d.md` removes the block that searched the guard **and** this report) and what
  replaced it (`slice-6d.md:1032-1034`) searches the guard file alone; I re-ran that exact command from the
  report — `grep -n "per shared word\|printed per word\|fires before"
  scripts/guards/copy-taxonomy-guard.mjs ; echo exit=$?` → `exit=1`. It is self-reproducing (its own text lives
  in the report, never in the search target) and stable (none of the three patterns is in the guard).
- **B2/B3 — the two wrong items are GONE; the reduced boundary is nevertheless NOT fully true (F2).** `extras`
  and "three baselines" no longer exist as boundary items — `git diff a953db0 0bcd132 --
  .scratch/v28/reports/slice-6d.md` shows both removed, and `grep -rn "extras"
  .scratch/v28/reports/slice-6d.md` → `:1016` only, which is §15's *description* of the deleted item, not a
  claim. Two of the three replacement clauses and the coverage clause are true and reproduced (§3). The middle
  clause — `**the instruments' own counters**, whose emptiness is a print rather than a verdict`
  (`slice-6d.md:949`) — is false of the guard's counters, which are five tripwires in this very guard and rows
  of §13's own sweep table.
- **N1 — HOLDS for both locations it named, with a residue.** The clause is gone from the output
  (`scripts/guards/copy-taxonomy-guard.mjs:460-461`) and from the code comment (`:455-457`: "A kind the
  taxonomy does not have is not this counter's to enforce"), and `grep -rn "rule 1"
  scripts/guards/copy-taxonomy-guard.mjs` → no output, so the guard file states it nowhere. The shortened
  sentence still asserts something the mechanism cannot support in a sibling state (F1), and the same claim
  survives in prose and in the check's comment (F5).
- **N4 — HOLDS, and the pin can FAIL.** `/tmp/rev5/N` → `✗ a declared claim rule 3 cannot CHECK is a FINDING,
  not a limit line (B2b) — exit 1: - 1 declared claim(s) … could not be CHECKED by rule 3 — .`, `1 check(s)
  failed`. The diverged finding text is exactly what my round-4 §0d reproduced, so count and names are now tied.
- **N5 — HOLDS, and the pin can FAIL.** `/tmp/rev5/P` → exactly two checks red (`the tree passes, and the run
  reports the taxonomy…` and the B2b seed), `2 check(s) failed`, exit 1, nothing else moves — which is what §15
  claims.
- **N8 — HOLDS (deleted, not restated).** The diff removes both: the "and by the per-kind line" clause and the
  whole sentence about what the B3 mutation's check name does and does not assert. `grep -n "claimsUnchecked"
  scripts/guards/copy-taxonomy-guard.mjs` → `:364`, `:368`, `:467`, `:518` — the finding's list is the only
  reader, which is what the corrected sentence now says.

---

## §2 THE MEASUREMENT: §14 1615 → 1465 words, −150 — verified independently

Section boundaries were read out of the file, not assumed:
`git show a953db0:.scratch/v28/reports/slice-6d.md | grep -n "^## §1[3-6]"` → `879:## §14 …`, and no §15 (the
file is 1006 lines, §14 is its last section); `git show 0bcd132:.scratch/v28/reports/slice-6d.md | grep -n
"^## §1[3-6]"` → `879:## §14 …` and `993:## §15 …`, so §14 is `:879-992`.

- `git show a953db0:.scratch/v28/reports/slice-6d.md | sed -n '879,1006p' | wc -w` → **1615**
- `git show 0bcd132:.scratch/v28/reports/slice-6d.md | sed -n '879,992p' | wc -w` → **1465**

**Difference: −150. The builder's number is exactly right and the prose really did shrink** (128 → 114 lines).
The size half of the deletion-based justification holds; §3 audits the "more true" half.

---

## §3 The reduced boundary, clause by clause (`slice-6d.md:946-953`)

1. **"the sets its own diff touched (`ambiguousWords` is the proof — found by review, not by the sweep)"**
   (`:948`) — **TRUE.** `grep -n "ambiguousWords" scripts/guards/copy-taxonomy-guard.mjs` → exit 1 (deleted in
   round 3), and §14's own F3 table names the sets that diff touched.
2. **"the instruments' own counters, whose emptiness is a print rather than a verdict"** (`:949`) — **FALSE as
   written.** See F2.
3. **"coverage as opposed to emptiness … non-declared kinds sharing a word leave the scan set non-empty, so the
   run still passes while rule 4 covers none of them. That reduction is printed per kind in the run's own output
   and is not tripwired; rule 3's coverage prints as a ratio, and rule 4's does not"** (`:950-953`) — **TRUE,
   reproduced.** `/tmp/rev5/B` (six non-declared `case` returns collapsed onto one word) prints
   `scanned words: 3 (Playground, Pool, Beach)`, six lines of
   `limit—— kind "…" is not scannable: its word "ZzShared" is the label of 6 kinds (park, indoor_play, museum,
   splash_pad, library, trail) …`, then `PASS …`, `B_EXIT=0`; rule 3's ratio is the printed
   `declared claims CHECKED by rule 3: 3 of 3 the taxonomy accepts` and rule 4 has no such line.

The lead-in — "The sweep covers the sets it lists: the measurements on this guard's own path that a copy
module's words can empty" (`:947-948`) — is a **loose gloss**: three of §13's rows are not measurements a copy
module's words can empty (`offeredKinds ⊄ allKinds` at `:824`, the label-function `fallback` at `:821`, and the
check's own seed premises). The operative claim ("it covers the sets it lists") is true, so I record the gloss
and do not file it.

**The reduction dropped one true item rather than narrowing it.** Round-3 item 5 ("anything downstream of the
exit code — this report's prose, the lane records, the work item") is gone, and my round-4 N2 asked for a
*narrower* statement, not for removal. Judgment: **not a defect** — the replacement lead-in's scope sentence
("the measurements on this guard's own path") excludes prose by construction, and the clause that was wrong
("A guard cannot watch what reads it", false because `factory-guard` does police report prose) is now out of the
artifact. But the specific boundary N2 named — the ledger, the work item and this guard's own report are
outside that instrument's scan root — is no longer declared in this list anywhere. Recorded for adjudication,
not filed as a finding.

---

## §4 The class hunt (D-025, D-030) in what round 4 ADDED

| what round 4 added | what the code below it does | verdict |
|---|---|---|
| a reduced boundary list (`slice-6d.md:946-953`) | two clauses true and reproduced; one false of the guard's counters | **F2 — FALSE CLAIM (prose; blocking for the round's own question)** |
| two new pins (`check.mjs:267`, `:416`, `:419`) | both can FAIL: `/tmp/rev5/P` → 2 checks red, `/tmp/rev5/N` → 1 check red | **clean — real pins, mutation-proved, no phantom** |
| one deleted output clause (`guard.mjs:460-461`, comment `:455-457`) | the clause is gone from both; the surviving half of the sentence is unsupported when the walk is empty for a reason other than absence | **F1 — FALSE CLAIM (printed reason; non-blocking)** |
| one baseline key (`factory-guard.mjs:1296`) | the line it keys is real: `.scratch/v28/reports/slice-6d-verify-4.md:6` is the keyed line and its only occurrence of that command shape (`grep -c "rev-parse" .scratch/v28/reports/slice-6d-verify-4.md` → `1`); the instrument's own size moved 646 → 647 with it; an independently patched copy of the instrument prints `DIAG bare-head baseline keys never matched: 0 of 417` | **clean — no phantom key, no lost key** |

**Sets that can come back empty and be consumed as health: I found none in what round 4 added.** The two new
pins exist to close such sets and each fails when its subject goes missing; the baseline key is real and every
recorded key still matches; the guard's five tripwires (`guard.mjs:508`, `:515`, `:523`, `:526`, `:529`) still
fire on `/tmp/rev5/D` (`D_EXIT=1`, no silent pass); and the check's own run counters are unasserted but cannot
go empty into a green run (the identity check at `check.mjs:247` always executes, and an uncaught throw exits
non-zero). Nothing in this diff is a mechanism hole. Every defect below is a written claim.

---

## §5 Findings

### F2 — FALSE CLAIM (blocking for this round's question; PROSE — one clause, no mechanism change)

`.scratch/v28/reports/slice-6d.md:949` — the reduced boundary's middle item: "**the instruments' own
counters**, whose emptiness is a print rather than a verdict". The guard's counters **are** verdicts:
`if (kindsByLabel.size === 0) {` (`scripts/guards/copy-taxonomy-guard.mjs:508`),
`if (claimsChecked < claimsAccepted) {` (`:515`), `if (constsRead === 0)` (`:523`),
`if (stringsRead === 0)` (`:526`), `if (claimsRead === 0)` (`:529`) — five tripwires, i.e. the emptiness of
those counters IS a finding. §13's own sweep table lists them as **covered** rows
(`.scratch/v28/reports/slice-6d.md:818` for `claimsChecked`, `:819` for `constsRead` / `stringsRead` /
`claimsRead`). And this round's own two pins made the guard's printed pair verdict-bearing
(`scripts/guards/copy-taxonomy-guard.check.mjs:267` asserts `declared claims CHECKED by rule 3: 3 of 3 the
taxonomy accepts`; `:416` asserts `2 of 3`) — the diff that wrote this clause also wrote the evidence against
it. The item it replaced was correctly scoped: round 3's item 2 said "**the check's** internal sets … (a
**check's** counters are its output, not a verdict)" — the reduction widened one instrument to both and turned a
true sentence into a false one. By the brief's own question, this is the answer: **the reduced boundary is not
now true.** Fix: scope it back to the check's own run counters (`passes`, `failures`, `guardRuns`,
`mutationRuns` — `scripts/guards/copy-taxonomy-guard.check.mjs:100-101`, `:503`), or delete the justification
clause and keep the item.

### F1 — FALSE CLAIM (non-blocking, `ladder:`; a printed reason in the mechanism's own output)

`scripts/guards/copy-taxonomy-guard.mjs:460-461` — `the declared kind "…" is not scannable: the taxonomy has no
kind "…" at all, so rule 3 has nothing to check`. This round deleted the clause that was false when the walk
comes back empty and left the rest of the sentence asserting a fact the guard cannot know in that same state.
Reproduced: `/tmp/rev5/R` (`export const PLACE_KINDS = [` → `export const PLACE_KINDS_RENAMED = [`, one
occurrence) prints `limit—— src/lib/firstRunTour.ts: the declared kind "playground" is not scannable: the
taxonomy has no kind "playground" at all, so rule 3 has nothing to check`, while the very file it read still
contains `'playground'` (`grep -c "'playground'" /tmp/rev5/R/src/lib/places.ts` → `3`) and its own finding says
`no PLACE_KINDS array of string literals — the taxonomy walk found nothing`. The guard's own header calls this
exact defect: "a printed reason that is not the real one is the same defect as a claim the mechanism does not
support" (`:60-62`; the same sentence at `:307`). One hedge fixes it — make the sentence describe the walk ("the
taxonomy walk found no kind …"), or condition it on the walk state. No health is consumed (`R_EXIT=1`), which is
why this is non-blocking. **Same line, same class as round-3 F6 and round-4 N1: third landing.**

### F5 — FALSE CLAIM (non-blocking, `ladder:`)

`.scratch/v28/reports/slice-6d.md:997` — "(*no reachable `claimsAccepted === 0` state passes — rule 1 owns
it*)". In that state rule 1's subject is suppressed by construction
(`scripts/guards/copy-taxonomy-guard.mjs:431`: `const missing = allKindSet.size > 0 ? declared.filter(…) :
[]`), so rule 1 produces no finding at all; the run fails on the taxonomy-walk finding and the scan tripwire —
which is what the same section reproduces two screens below (`slice-6d.md:1032-1037`: `D_EXIT=1`,
`FAIL — 2 finding(s)`, neither naming rule 1) and what the ledger records (`ledger.md:7222`:
"`claimsAccepted===0` reaches exit 1 via the taxonomy-walk finding + scan tripwire"). The artifact contradicts
itself within one section. The same phrase lives at `slice-6d.md:800` ("a declared kind the taxonomy does not
have is rule 1's finding, not the counter's"), `ledger.md:7218` and
`scripts/guards/copy-taxonomy-guard.check.mjs:290` — each accurate in the zoo state that exercises it, false
only in the walk-empty state `:997` is about. Fix: delete the parenthetical, or name the two findings that
actually fire.

### F4 — FALSE CLAIM (non-blocking, `ladder:`)

`factory/decisions.md:855-856` and `.scratch/v28/ledger.md:7223` — "the heading also carried an instance
**count** — which was wrong, and wrong again the moment a row was added". The record shows the count was
**right** in the first draft and wrong **once**: `git show 377d534:factory/decisions.md | sed -n '/^## D-030/,
/^## D-031/p' | grep -c "^| [0-9] |"` → `3` with the heading `(three instances, now a named class)` —
consistent; the same command at `efeeeda` → `4` rows with the heading still `three` (wrong, and wrong *because*
a row was added); at `2e46235` → `4` rows, heading corrected to `four`; at `915be5e` → the count deleted. So
"wrong, and wrong again" overstates by one, in the entry about claims the artifact does not support, in the
paragraph added to fix that very class. **Fourth landing in this entry** (round-3 F5, round-4 N6, now this).
Fix: delete "and wrong again" — the surviving half is exactly what the record shows.

### F3 — FALSE CLAIM (non-blocking, low; `ladder:`)

`factory/decisions.md:857` — "**So this entry now counts nothing and points at nothing.**" The same entry counts
twice: `:852` "and twice now the taxonomy guard has", `:828` "recognised immediately as the third sighting".
Both numbers are true today; what is false is the self-description, and it is the sentence-shape round-4 N6 was
about. One word fixes it (e.g. "this entry names no line numbers and no total"), or restore the counts as the
intended claims.

---

## §6 Requirements traceability

| claim / criterion | status | evidence |
|---|---|---|
| B1: the self-invalidating transcript is gone | **met** | `git diff a953db0 0bcd132 -- .scratch/v28/reports/slice-6d.md` removes the two-target grep; replacement at `:1032-1034` |
| B1: the replacement is stable and self-reproducing | **met** | the report's own command re-run → `exit=1`; none of the three patterns is in the guard |
| B2/B3: the two wrong items are deleted, not restated | **met** | both absent as boundary items; `grep -rn "extras" .scratch/v28/reports/slice-6d.md` → `:1016` only, §15's description of the removal |
| B2/B3: **the reduced boundary is now TRUE** | **not met** | F2: `slice-6d.md:949` vs `guard.mjs:508/515/523/526/529` and §13's own rows (`:818`, `:819`). The other two clauses + the coverage clause: met and reproduced (§3) |
| the shrink is real, and the reported number | **met** | 1615 → 1465 by `wc -w`, −150 exactly, method in §2 |
| N1: the clause gone from the output and the code comment | **met** (both named locations) | `guard.mjs:460-461`, `:455-457`; `grep -rn "rule 1" scripts/guards/copy-taxonomy-guard.mjs` → no output. Residue on the same line: F1; the same claim in prose: F5 |
| N1: §14's F6 paste refreshed against a live run, verbatim | **met** | `/tmp/rev5/Z` reproduces the three pasted lines exactly |
| N1: the emptied-`PLACE_KINDS` repro and "no line mentions rule 1" | **met** | `/tmp/rev5/D` → `D_EXIT=1`, `FAIL — 2 finding(s)`; `grep -n "rule 1" /tmp/rev5/D.out` → exit 1 |
| N3: the counter's empty denominator is inside the new coarse exclusion | **partially met** | the clause does cover that state (there the counter is a print, not a verdict) — but by generalizing to all counters, which is F2 |
| N4: the names-vs-count pin is real and can fail | **met** | `/tmp/rev5/N` → 1 check red, `…could not be CHECKED by rule 3 — .` |
| N5: the printed-pair pin is real and can fail, in two places | **met** | `/tmp/rev5/P` → exactly 2 checks red nothing else; assertions at `check.mjs:267`, `:416` |
| N8: both readership over-claims deleted, not restated | **met** | the diff removes both; `grep -n "claimsUnchecked" scripts/guards/copy-taxonomy-guard.mjs` → `:364/368/467/518` only |
| the baseline key is real, occurs once, and nothing was lost | **met** | `grep -c "rev-parse" .scratch/v28/reports/slice-6d-verify-4.md` → `1`; the instrument's own size moved 646 → 647 with it; patched instrument → `0 of 417` unmatched |
| no scope creep in the code half | **met** | `git diff a953db0 0bcd132 -- scripts/guards/copy-taxonomy-guard.mjs` = one comment + one string; the check = two assertions; `factory-guard.mjs` = one key + its comment; no `.test.mjs`, no new export, no orphan |
| §15's gate rows (guard 0; check 29/26/8; run-all PASS; oxlint silent; baseline new 1) | **met** | all reproduced in §0/§4 |
| §15: `npm run verify` exit 0; 71 files / 2068 tests; 81 warnings; 0 errors | **attested, not reproduced** | my shell does not run the suite; §15 labels nothing about it falsely |
| §15: `no-bare-head-count` new 1 / lost 0 / decreased 0 | **met where reproducible** | the run's own size 646 → 647 matches the one key; `0 of 417` unmatched keys is my independent check on the "lost 0" half |

---

## §7 Recommended next action

One prose pass, no mechanism change and no sixth round: scope `slice-6d.md:949`'s middle clause to the check's
own run counters (F2 — the round's one blocking item); hedge `guard.mjs:460-461` so the sentence describes the
walk (F1); delete "rule 1 owns it" from `slice-6d.md:997` (F5); delete "and wrong again" from
`decisions.md:855-856` and `ledger.md:7223` (F4); and one word on `decisions.md:857` (F3). If the orchestrator
prefers to close the batch now, F2 is the only item I would not call known-open — and even it is a one-clause
prose fix, not a mechanism.

**Ladder note (D-025 / D-030).** F1, F3, F4 and F5 are the same class this slice has now paid five times — a
written claim the artifact does not support, found in text a round *added* while fixing that class — and F2 is
its sixth: a boundary clause generalized one instrument too far. The mechanisms are converged (no finding here
is a mechanism defect; both new pins can fail; the one baseline key is real and no recorded key was lost); the
prose is not. The rung that ends this is the one my round-4 note named and D-025/D-030 still only queue: a rule
that reads the claims a round *adds*. `factory-guard`'s existing prose-number and transcript rules
(`factory-guard.mjs:1360-1445`) already read that family of lines, and a boundary clause that names an
instrument is decidable against that instrument's own tripwires — so F2's class is mechanically catchable even
if F1/F5's is only reviewable.
