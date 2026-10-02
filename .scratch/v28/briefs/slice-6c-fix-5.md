# Slice 6c — FIX ROUND 5 (the ladder's LAST round — round 5's breaker adjudicates)

**Working directory:** `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`
**Base:** `824f419` (HEAD). **Round 4:** builder `876a516`; verifier `VERIFY: PASS`; reviewer `NEEDS_CHANGES`.
**You are a FRESH builder** (rung 5). Read `docs/agents/code-structure.md` first.
**Report to `.scratch/v28/reports/slice-6c-fix-5.md`.** Write it FIRST and append raw tails as produced.

---

## The one theme of this round: make the rule match the CLASS it is named for

Four rounds have fixed **instances**. Each round's own report then produced a fresh one. Round 4's rule
(`no-bare-head-count`) is honest but **narrower than its name** — the reviewer measured exactly why: the rule
matches the `N at HEAD` shape, and round 4's report used **`HEAD .scratch`** and **`git show HEAD:`**, which
the pattern cannot see. **So the loop has not been converging: the instrument could not see the shape the
class actually takes.**

**This round widens the instrument to the class.** That is the whole job. If you widen it correctly, the guard
catches your own report before you commit — and the reviewer's finding 6 becomes false in the right direction.

⚠️ **Do not hand-edit the baseline to make anything pass.** Re-derive it from the widened pattern's real
matches and record what it becomes. A baseline edited to fit is the exact failure this slice exists to kill.

---

## B1 (BLOCKING) — round 4's OWN report carries a fresh instance, and `:15` says it does not

```
:57  $ git ls-tree -r --name-only HEAD .scratch | wc -l
:58  280
:29  before (git show HEAD:scripts/guards/factory-guard.mjs): grep -c instrument-headers-honest → 0
:15  … **no number is labelled `HEAD`**. Where a raw tail would have written a bare-`HEAD` …
```

Measured by the reviewer: `280` holds at `9f20d02` **and** `99d044f`, but at `876a516` — **the commit carrying
the sentence** — the same quoted command returns **281**. And `:29`'s quoted command now returns **`1`**, not
`0`, because `HEAD` resolves to the *fixed* guard. Both were true at measurement time; both are unreproducible
at the commit that carries them; and `:15` **asserts they do not exist**, one line above its own stated
convention (which says such a label "is rendered `<HEAD>` in this report").

**Fix, per the reviewer's own recommendation:** name the commit at both sites (`9f20d02` — 280 holds there and
at `99d044f`) **or** render both `<HEAD>` per the report's own convention. Then make `:15`'s claim true.

Also fix `:4`, which attaches "the tree HEAD when this round started" to `9f20d02` when the starting HEAD was
really `99d044f` (the graph is `9f20d02 → 99d044f → 876a516`, and `99d044f` precedes your commit).

---

## F1 — widen the match to the class: `git ls-tree … HEAD`, `git show HEAD:`, and any `N at HEAD`

`scripts/guards/factory-guard.mjs` — the pattern must cover the shapes the class actually takes, not only
`N at HEAD`. The measured misses are `HEAD .scratch` inside `git ls-tree … | wc -l`, and `HEAD` inside
`git show HEAD:<path>`. Decide the rule's shape deliberately and **state what it still cannot see.**

**Then re-derive the baseline** from the widened pattern on the real tree, and **print its new size at run
time as before**. It will grow; that is honest. `factory/decisions.md` **D-011 item 2** still binds: the
historical records' bytes do **not** change — the baseline absorbs them.

## F2 — `factory-guard.mjs:395` counts at most ONE occurrence per line

`BARE_HEAD_COUNT.exec(line)` counts the first match and drops the rest, so a second new occurrence appended to
a line that already carries a counted one is **invisible**. The reviewer proved it: doubling the `265 at HEAD`
on line 81 of a `/tmp` copy of `slice-6c-fix-2-review.md` leaves 5 occurrences on disk against a recorded 4 and
**the guard exits 0**. Two live lines already carry two matches each (`slice-6c-fix-2-review.md:245`,
`slice-6c-fix-3-review.md:177`). **Count every match on the line.** Then say whether the baseline's recorded
counts stay valid or must move — measured, not assumed.

## F3 — `factory-guard.mjs:432`: the `ok —` claim states more than the check does

The claim reads `every report and brief count naming the commit it was measured at`; the check only rejects a
count whose label is `at HEAD`. Counterexample the reviewer found in a scanned file:
`slice-6c-fix-4.md:256` carries `2067 passed (2067)` with no commit, and the guard prints the claim and exits 0.
The same over-broad phrasing sits in the rule list at `factory-guard.mjs:47-48`.
**This is N2's own class recurring inside N2's fix.** Reword to what the mechanism actually establishes —
suggested: *"no count labelled HEAD in any report or brief"*. Keep it consistent in both places.

## F4 — the guard header must state its SCOPE (a build-law finding)

`docs/agents/code-structure.md:121-127` is explicit: *"The guard's header states its SCOPE — the directories
and extensions it reads, and what it therefore does not count — and that header, not this paragraph, is the
authoritative statement of what the guard covers."* `regexp-escape-guard.mjs:31` is the repo's worked example.
`factory-guard.mjs`'s header has **no** SCOPE block; the new rule's scope is argued in report prose instead.
**Add the SCOPE block** — the directories and extensions read, and what is therefore not counted.

## F5 — `.scratch/v28/reports/slice-6c-fix-4.md:306` names a path that does not exist

It names `.scratch/v28/plan.md` as an unscanned location; measured, that path does not exist (`plan.md` lives at
the repo root and in other lanes). The other location it names, `.scratch/v28/ledger.md`, is real and really
holds an occurrence. **Fix the path.**

---

## D1 — record the ledger exclusion as a decision, not a `ladder:` bullet

The reviewer: the scan scope (`.scratch/v28/{reports,briefs}`) is the **right** boundary, but *"an exclusion
that lives only in a `ladder:` bullet is a silence with a footnote."* The excluded `.scratch/v28/ledger.md`
really does carry the class at **`:7091`** (`265 at HEAD`) — so the boundary is load-bearing, not theoretical.
**Add one line to `factory/decisions.md`** naming `ledger.md:7091` as known-open with `file:line`, the way
D-011 item 1 recorded its two lines. **Do not touch `ledger.md` itself (D-002).**

---

## What round 4 got right — do not undo it

The reviewer upheld all of it, measured: **B1, N1, N2, N3, N4, N5 all met**; the baseline is **exact** (it
recounted all 13 keys independently — 23 occurrences, no key over-recorded); the disk-vs-`git ls-files` seam is
**honest and strictly stronger** in the real repo (116 `.md` on disk, 116 tracked, `comm -3` empty); N2's
unconditional `every floor meetable` / `every artifact present` claims are **backed by checks that always run**;
and **`factory/work/v28-r2-6c.json` was NOT the builder's edit** — it was the orchestrator's own commit. No lane
violation. **Leave all of that alone.**

---

## Verification — you run it, report the raw tail

1. `node scripts/guards/factory-guard.check.mjs` → exit 0; every check fires; the run-time counter agrees with
   an independent count of the check lines. **Add a check for the widened pattern AND a check for the
   second-occurrence-on-a-line case (F2)** — each must be able to fail.
2. `node scripts/guards/regexp-escape-guard.check.mjs` → exit 0, `all 12 checks passed`.
3. `bash scripts/guards/run-all.sh` → exit 0, `GUARDS: PASS`.
4. `npm run verify` → exit 0. **RE-MEASURE**; do not copy. Round 4 measured 71 files / 2067 tests / 81 warnings
   / 0 errors. Account for every delta. oxlint prints no banner off-TTY — count with `grep -c ': warning '`.
5. `bash scripts/steering-lint.sh` → AGENTS.md 1789/1800. Do not push it over.
6. **Prove the widened rule catches B1's actual shapes**: seed `git ls-tree -r --name-only HEAD .scratch | wc -l`
   with a count, and a `git show HEAD:` count, in a `/tmp` root — and show both fire. Then prove the baselined
   historical occurrences still pass.
7. **Grep your own report with the widened rule and paste the output** — empty or not. The brief's round-4
   instruction stands: *if the rule catches you, say so; do not weaken the rule.*

**Commit** with a per-finding message. **Do not push** (production is V27; this batch does not push mid-batch).

---

## Report format (`.scratch/v28/reports/slice-6c-fix-5.md`)

Per-finding table: finding → change → the command that proves it → raw result. A section on the widened rule:
the new pattern, the new baseline and its printed size, what it still cannot see, the F2 per-line fix and what
it did to the baseline counts, the SCOPE block, and the exact behaviour-check output (including both new
checks). Your measured `npm run verify` numbers with every delta accounted for. The raw verify tail. Anything
noticed and not fixed, named with `file:line`. **A rejection is allowed if argued from a measurement** — the
orchestrator adjudicates every one.
