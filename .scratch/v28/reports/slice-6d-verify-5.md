# Slice 6d — VERIFICATION, ROUND 5 (fresh context, last rung in the ladder)

**Verdict: `VERIFY: PASS`**

**What was verified.** The tree under test is working-tree state at commit `e8956e1` (the fix round 4 commit
is `0bcd132`; `git diff --name-status 0bcd132 e8956e1` touches `.scratch/v28/ledger.md` only, so every file the
fix round 4 changed is byte-identical to the state I measured). The reviewed state the fix answered is
`a953db0` (`git diff --name-status c70070a a953db0` changes `ledger.md` only; `.scratch/v28/reports/slice-6d.md`
is byte-identical at `c70070a` and `a953db0`, which is why the round-4 review's cited line numbers —
`:924-925`, `:951-968`, `:956`, `:959` — resolve at both). I re-ran every command in this report myself; no
number below is copied from a prior report.

**Note on the two things that mattered most.** Both re-check clean — see §(a) and §(b) below. The B1 replacement
command reproduces its own quoted output, and N1's clause is gone from the printed limit line *and* from the
code comment it was also in, confirmed by emptying `PLACE_KINDS` on a throwaway tree.

---

## 1. `npm run verify` → exit 0

One run, captured to `/tmp/verify5/verify.out`. `npm run verify` is `build && test && lint && a11y:focus &&
steering-lint && guards`.

| what | value I measured |
|---|---|
| exit code | **0** |
| test files | `Test Files  71 passed (71)` |
| tests | `Tests  2068 passed (2068)` |
| lint warnings (`grep -c ': warning '`) | **81** |
| lint errors (`grep -c ': error '`) | **0** |
| AGENTS.md figure | `ok — AGENTS.md (1789 words, ceiling 1800)` |
| guards | `GUARDS: PASS — all deterministic rules hold.` |
| `grep -c '^  FINDING'` over the whole gate output | **0** |
| plain `grep -c FINDING` over the whole gate output | **2** |
| test delta | none — the fix touched no `.test.mjs` (`git diff --name-status 915be5e 0bcd132` = report, `copy-taxonomy-guard.check.mjs`, `copy-taxonomy-guard.mjs`, `factory-guard.mjs`) |

**The `FINDING` disclosure is accurate.** `grep -c '^  FINDING'` returns `0`, and the plain `grep -c FINDING`
returns `2` because the two matches are this round's own *passing* check names, not findings:

```
scripts/guards/copy-taxonomy-guard.check.mjs:627:  ✓ a declared claim rule 3 cannot CHECK is a FINDING, not a limit line (B2b)
scripts/guards/copy-taxonomy-guard.check.mjs:631:  ✓ a scan that can attribute no word to any kind is a FINDING, not a pass (B3)
```

(Those are lines 627 and 631 of the gate output; both carry `✓`.) The report's current gate rows say exactly
`^  FINDING` = 0 with `grep -c FINDING` = 2 and name B2b and B3 — that is the state I measured.

*One historical note, not a defect:* §12's fix-round-1 gate row (line 732) says `grep -c FINDING` returns 1.
That was true when only the B3 check name existed; it is a past-round record, and the current-tree rows
(§13/§14/§15) say 2.

## 2. `bash scripts/guards/run-all.sh` → exit 0

```
GUARDS: PASS — all deterministic rules hold.
```

## 3. `node scripts/guards/copy-taxonomy-guard.mjs` (real tree) → exit 0

Printed counts, the whole run:

```
  taxonomy: src/lib/places.ts
  kinds read: 10; offered: 8; words: 9
  scanned words: 9 (Park, Playground, Indoor play, Museum, Pool, Splash pad, Library, Beach, Trail)
  limit—— kind "other" is not scannable: its word is the label function default, which every kind without its own case shares, so a match could not be attributed to it (see WHERE IT STOPS in the header)
  module: src/lib/firstRunCopy.ts
  copy consts read: 2 of 2 named; declared claims: 0 (none)
  module: src/lib/firstRunTour.ts
  copy consts read: 4 of 4 named; declared claims: 3 (playground, pool, beach)
  module: src/lib/push.ts
  copy consts read: 1 of 1 named; declared claims: 0 (none)
  module: src/lib/theme.ts
  copy consts read: 1 of 1 named; declared claims: 0 (none)
  module: src/lib/feed.ts
  copy consts read: 2 of 2 named; declared claims: 0 (none)
  declared claims CHECKED by rule 3: 3 of 3 the taxonomy accepts

PASS — every declared taxonomy claim exists, is offered, is backed by the copy, and the copy names no category it did not declare.
```

The pair is `declared claims CHECKED by rule 3: 3 of 3 the taxonomy accepts`, backed by `kinds read: 10;
offered: 8; words: 9`.

## 4. `node scripts/guards/copy-taxonomy-guard.check.mjs` → exit 0

```
copy-taxonomy-guard check: all 29 checks passed, 0 failed, across 26 guard invocations (8 of them against a mutated copy of the guard), against scripts/guards/copy-taxonomy-guard.mjs.
```

**29 / 26 / 8 verified independently, not read off the summary.** Static enumeration from the check source:
6 `rule()` sites × (1 seed check + 1 mutation check) = 12 checks and 12 runs and 6 mutations; 10 one-off
`check(` sites after `r = run()`; 2 clean-run checks and 1 clean run; the identity check (0 runs); 2 B2b checks
+ 2 runs + 1 mutation; 3 B3 checks (premise, finding, mutation) + 2 runs + 1 mutation; 1 final clean check + 1
run. Totals: checks 12+10+2+1+2+3+1 = **29**; runs 12+10+1+0+2+2+1 = **26**; mutations 6+1+1 = **8**. The
captured output independently has **29** `  ✓ ` lines and **8** lines whose name contains `MUTATION`. Round 4
added **no** `check(` call site — `grep -c "check("` on the file is **25** at both `915be5e` and `0bcd132`; the
diff adds only assertion clauses and their comments inside two existing checks.

**The two NEW pins actually fire — re-derived myself on throwaway guard copies** (via
`COPY_TAXONOMY_GUARD_UNDER_TEST`, never touching a repo file):

- **N5, the clean-run pair** (`declared claims CHECKED by rule 3: 3 of 3 …`). Deleted the guard's print line
  from a copy under `/tmp`; the check goes red with exactly **2** failures and no other —
  `✗ the tree passes, and the run reports the taxonomy, the words and the declarations it derived` and
  `✗ a declared claim rule 3 cannot CHECK is a FINDING, not a limit line (B2b)` — `27` checks passed, exit 1.
  (Both the clean assertion and the B2b `2 of 3` assertion read that same printed line, so deleting it is
  fatal to both, as claimed.)
- **N4, the B2b finding's name list** (`src/lib/firstRunTour.ts claims "beach"`). Deleted the
  `claimsUnchecked.push(...)` from a copy; the check goes red with exactly **1** failure and no other —
  the B2b check, printing the diverged finding `… could not be CHECKED by rule 3 — .` — `28` checks passed,
  exit 1. That is the exact divergence review-4's N4 described, and the new assertion is what catches it.

---

## (a) B1's replacement is stable — the command reproduces its own pasted output

Run verbatim, exactly as pasted in `.scratch/v28/reports/slice-6d.md` §15:

```
$ grep -n "per shared word\|printed per word\|fires before" scripts/guards/copy-taxonomy-guard.mjs ; echo exit=$?
exit=1
```

My run returns **no matches and `exit=1`** — the same text the report quotes. Unlike the deleted transcript,
this one cannot match its own command line, because the pattern is searched only inside the guard file and
`scripts/guards/copy-taxonomy-guard.mjs` contains none of the three clauses (a case-insensitive `grep -in
"rule 1"` over that file is also empty). The report's §15 paste is therefore reproducible.

Related pasted transcripts re-run clean too: §14's F3 block (`node … | tail -3` prints the pair and the PASS
sentence; `grep -n "ambiguousWords" … ; echo exit=$?` prints `exit=1`), and §14's F6 zoo paste — a live zoo
run on `/tmp/rev5/Z` returns exactly the three quoted lines verbatim, with `FAIL — 1 finding(s)`.

## (b) N1's clause is gone from BOTH places; emptied `PLACE_KINDS` prints no such claim

Throwaway tree `/tmp/rev5/D` (a copy of `src/lib` with `PLACE_KINDS` emptied to `[] as const`), real guard:

```
$ node scripts/guards/copy-taxonomy-guard.mjs /tmp/rev5/D
D_EXIT=1
  taxonomy: src/lib/places.ts
  kinds read: 0; offered: 8; words: 9
  scanned words: 0 (none)
  module: src/lib/firstRunCopy.ts
  copy consts read: 2 of 2 named; declared claims: 0 (none)
  module: src/lib/firstRunTour.ts
  copy consts read: 4 of 4 named; declared claims: 3 (playground, pool, beach)
  limit—— src/lib/firstRunTour.ts: the declared kind "playground" is not scannable: the taxonomy has no kind "playground" at all, so rule 3 has nothing to check
  limit—— src/lib/firstRunTour.ts: the declared kind "pool" is not scannable: the taxonomy has no kind "pool" at all, so rule 3 has nothing to check
  limit—— src/lib/firstRunTour.ts: the declared kind "beach" is not scannable: the taxonomy has no kind "beach" at all, so rule 3 has nothing to check
  module: src/lib/push.ts
  copy consts read: 1 of 1 named; declared claims: 0 (none)
  module: src/lib/theme.ts
  copy consts read: 1 of 1 named; declared claims: 0 (none)
  module: src/lib/feed.ts
  copy consts read: 2 of 2 named; declared claims: 0 (none)
  declared claims CHECKED by rule 3: 0 of 0 the taxonomy accepts

FAIL — 2 finding(s):
  - src/lib/places.ts: no PLACE_KINDS array of string literals — the taxonomy walk found nothing, so every rule below would be vacuous
  - src/lib/places.ts: the scan found NO word it can attribute to a kind — every kind word resolves to the label function default, is shared with another kind, or is not named at all, so rules 3 and 4 would test NOTHING and a report of health would mean the guard did not look (see limit—— lines above)
```

`grep -in "rule 1"` over that output returns **0 lines** (`grep` exit 1). The limit lines say only what rule 3
does with the kind. And the source comment that carried the same unconditional claim is rewritten — the branch
now reads `// A kind the taxonomy does not have is not this counter's to enforce: …`, with the old
`// … is RULE 1's finding …` gone; `grep -in "rule 1" scripts/guards/copy-taxonomy-guard.mjs` returns nothing.
So the clause is absent from both the printed line and the comment.

---

## 5. The rest of the round-4 review, re-measured

- **B2 — fixed.** No `extras` name survives in the boundary; the only occurrence left in `slice-6d.md` is §15's
  record of what was wrong (line 1016). The boundary is now three coarse exclusions (`the sets its own diff
  touched`, `the instruments' own counters`, `coverage as opposed to emptiness`).
- **B3 — fixed.** `grep -c "three baselines"` over `slice-6d.md` = 0; no baseline count is typed.
- **N3 — fixed.** The coarse exclusion names `the instruments' own counters` (the emptied-`PLACE_KINDS` state is
  now inside it).
- **N6 — fixed.** `factory/decisions.md` now says "this entry now counts nothing and points at nothing"; the
  heading's instance count is gone (`grep -c "instances, now a named class"` = 0).
- **N7 — fixed.** `262206ea` no longer appears in `.scratch/v28/ledger.md`.
- **N8 — fixed.** `grep -c "by the per-kind line"` over `slice-6d.md` = 0.
- **§14 word count** claimed `1615 → 1465` (−150): measured `wc -w` on the §14 block at `915be5e` and at the
  tree under test = **1615 → 1465**, exactly.
- **`no-bare-head-count`** claimed "new 1, lost 0, decreased 0": the run prints
  `baseline holds 647 recorded occurrence(s)` and the factory-guard diff for the fix adds exactly one entry
  (the round-4 verification report's own revision-probe entry); the report under test at `915be5e` sat at
  646. Consistent.

## Failure excerpts

- None. Every command exited 0 except the deliberate negative controls and throwaway-tree probes above, whose
  non-zero exits are the expected result (B1 `exit=1` for an absent pattern; `PLACE_KINDS` emptied → exit 1;
  the two mutated-guard runs → exit 1 by design).

## Residual risks / notes

1. The B1 replacement is non-self-matching only because it scopes the search to the guard file. Its own text
   contains the three patterns, so if a later edit added `.scratch/v28/reports/slice-6d.md` back as a second
   path argument the transcript would again match itself. The report's §15 command is correctly single-path
   today; that is the property worth a guard, per the round-4 review's own ladder note.
2. `slice-6d.md` §12 (line 732), a fix-round-1 historical record, still states `grep -c FINDING` returns 1.
   True at that round; the current gate rows correctly say 2. No current-tree claim is wrong.
3. `slice-6d-review-4.md`'s own "Reviewed range" header names `4b9a8ef c70070a`; the task names `a953db0`. The
   two agree for the file that mattered (`slice-6d.md` identical at `c70070a` and `a953db0`), so the fix base is
   unambiguous — noted only because the header and the dispatch differ in wording.
4. No repo file was modified by this verification; the only file written is this report. The working tree was
   clean (`git status --short` empty) through the whole run, and all throwaway trees live under `/tmp/rev5`.
