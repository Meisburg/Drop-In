# Slice 6b — FIX ROUND 1 (fresh builder, cloud)

**Verification PASSED** (69 files / 2027 tests, both guards registered, the 7-claim/95-quotation counts independently
reproduced, and the blind-spot checker's 5 cases green). **The reviewer found one blocking defect and five smaller
ones, and the blocking one is the best kind of finding: it is your own slice's class, committed by your own
commit.**

## B1 — [BLOCKING] Six dead line locators, three of them inside the new guard itself

**`check-acceptance-greps.mjs:16-17` cites `plan.md:239` and `plan.md:300` as the two condemned quotations — but
THIS COMMIT REFLOWED `plan.md`, so those texts now sit at `:241` and `:302`.** `plan.md:239` today is
``…src/lib/firstRun.ts` → **0 hits**.`` **And `check-acceptance-greps.check.mjs:15` repeats the dead `:239`.**

**The reviewer's framing, which I am adopting verbatim:** *"The new guard's own header documents the trap with
locators that are FALSE at HEAD. **Same class the builder already fixed at `plan.md:440-441`** — the correction was
paid for two references and skipped in three, one of them inside the new file itself."*

**Also orphaned by the same reflow — the reviewer measured all five:** `.scratch/v28/briefs/slice-6b.md:21,:22,:30`
(whose table literally says *"verified present today"*) and `.scratch/v28/briefs/slice-6.md:55,:56`.

**So: fix all six (three in the guard/checker, three in the two briefs) to the lines they actually are at HEAD** —
and **re-measure before you write**, because `plan.md` will move again as you edit the briefs. **`.scratch/v28/ledger.md`'s
old ones are DATED RECORDS and stay as they are** (the reviewer says so; a dated record is allowed to describe the
tree it was true of).

## B2 — [REAL, and it is the residual of the bug this slice says it fixed] `-H` without `-n`

`:145, :151, :235`: F1's comment detection needs a **`path:line:`** prefix, but only `-H` is forced, **not `-n`**.
Measured by the reviewer: `rg -H -- "zz" f.ts` returns **`f.ts:// a comment with zz`** — no line number — **so
`contentOf()` fails and a comment-only hit counts as a HIT.** Latent (all seven live claims pass `-n`), but
**this is the same shape as the `-H` bug you already fixed, one flag over.** **Force `-n` too, and seed it** — a
claim whose only hit is a comment, with a command that does *not* carry `-n` in the doc.

## B3 — [REAL, latent] The `>` marker allowance admits a quoted example as a claim

`:98`: a line-leading tag inside a **quoted example** is read as a claim (because `^\s*` plus the `>` list marker
both pass). Constructed input: a doc demonstrating the bad shape as
`  ACCEPTANCE-GREP: \`rg "of 5" src/\` → 0 hits.` → **judged as a claim.** **No live instance** — there are only four
`ACCEPTANCE-GREP` occurrences across the 89 documents and all are mid-line — **so the boundary holds today**.
**Tighten it or state it; either is fine, silently leaving it is not.**

## B4 — [documentation accuracy] The false negative you named is imprecise in both its locator and its reason

`:109-130`: the corpus is `plan.md` + `briefs/*.md` only, so the restatement is **out of corpus as well as
mid-line**; the reviewer located it at **`.scratch/v28/reports/slice-2-review.md:38-39`** (not `:35`), **it names no
backticked `rg` command**, and **its duplicate IS tagged** at `slice-2.md:107` and `plan.md:306`.
**Naming it is the right handling — fix the locator and the reason.**

## B5 — [the mechanism sentence is wrong, the conclusion is right] `no-bypass-guard.sh:40-42`

It says *"the filter that skips git's own prose shapes … is the same filter that makes the ordinary bypass
invisible."* **The reviewer: your own checker's premise proves the RAW reflog contains no `--no-verify` at all — so
no filter is responsible.** **Fix the sentence**; the conclusion it supports is correct.

## B6 — [an unproven half of a coverage statement] `no-bypass-guard.sh:44-45`

The header asserts **a second visibility path** (a wrapper-recorded reflog action text). **No checker case seeds it** —
FAST_PUSH_LOG and the unwired `hooksPath` are the two proven ones. **Either seed it, or demote the sentence to say it
is unproven.** *A coverage statement with an unproven clause is the thing this whole batch keeps catching.*

## ⚠️ AND A CONVENTION I AM FIXING ON MY SIDE, because it cost the review a check

The reviewer: *"I could not see the builder's raw 'Commands run' output: there is no report on disk
(`.scratch/v28/reports/` holds only `slice-2-review.md`), only the ledger's paraphrase; **`npm run verify` is
therefore not independently attested by me.**"* **That is my brief's fault — it said "the report" without saying
where a report LIVES.** **From this round on: write your report to `.scratch/v28/reports/<slice>.md`, with the raw
output tails in it, and commit it with the slice.** *(The verifier attested `verify` green, so the acceptance is met
across lanes — but a lane should not have to take another lane's word for a command it could have been handed.)*

## Acceptance

1. Every locator in B1 corrected **to a line you re-measured after your own edits**.
2. **B2, B3, B5, B6 each either fixed or stated**, with the reason.
3. **Every new or changed rule has a checker case that fails against the pre-fix code.**
4. `npm run verify` exit 0; both guard artifacts and both checkers exit 0 directly; `run-all.sh` exit 0.
5. **Your report committed at `.scratch/v28/reports/slice-6b-fix-1.md`**, with raw tails.

## Report

**`Committed as: <sha7>` from `git log --oneline -1`**, each locator's before/after with the command you measured
it with, which of B2/B3/B5/B6 you fixed versus stated and why, and anything the brief did not anticipate.
