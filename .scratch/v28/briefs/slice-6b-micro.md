# Slice 6b — MICRO-ROUND: one coverage clause that claims more than the guard delivers

*(Comment-and-report only. **Builder + verifier** — the same recorded deviation as 6a's micro-round: no executable
line changes, and the reviewer already named the exact correction.)*

Read `docs/agents/code-structure.md`. Worktree `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`. **Small
edits only.**

## Why

**Review PASSED and verification PASSED** — including an independent reproduction of the pre-fix red (2 of 14 checks
fail against `89e6269`), a `git hash-object` proof that no revert residue remains, and a reconciliation of the corpus
delta down to the line (`+2 quotations` are lines 29 and 38 of the new brief; `f9ab882`'s own brief edits are
**net-zero** because all four old and four new lines match the quotation regex).

**But this slice's entire subject is claims matching reality, and one of its own coverage clauses claims more than the
guard delivers.** So it gets one clause, not a paragraph of apology.

## C1 — [the finding] `no-bypass-guard.sh:43,46` and `.check.mjs:147`

The header says a bypass **"a WRAPPER recorded"** is visible. **The seed sets `GIT_REFLOG_ACTION` on a COMMIT**, so
what case 3 actually proves is that the prose filter admits a **non-prose action text on `logs/HEAD`** — **the artifact
the guard reads** — **not** the wrapper-*push* reading the clause invites.

**And the reviewer measured the difference:** `GIT_REFLOG_ACTION='push-wrapper: git push --no-verify' git push` left
`--no-verify` in **no** `.git/logs` file, and the guard reads only `logs/HEAD`.

**So: make the clause name the mechanism it proves.** The case exists and is red without it — **this is a wording
correction, not a re-open.**

## C2 — [a case named for more than it asserts] `check-acceptance-greps.check.mjs:258`

Case 11 is named *"…is a QUOTATION"* but **only asserts `exit === 0`** — a guard that ignored the line entirely would
also pass. **The class IS covered generally by case 2**, so this is not a hole: **either assert the quotation count
directly, or rename the case so it no longer claims what it does not assert.** Say which you chose.

## C3 — [report-level] Two nits in `.scratch/v28/reports/slice-6b-fix-1.md`

1. **No `sha7` in the report** (`:3-5`), though the brief's report format asks for it — it defers to the return
   message. **Put the id in the file**, since the file is the artifact that survives.
2. **`"the guard was restored (md5 equal afterwards)"` (`:251`) has no raw tail.** The reviewer attested it
   independently (clean tree + md5 `210683546eebb78dd2ded3a6b6ffde91`), **but a claim in a report should carry the
   command that made it.** Add the tail, or point at where it is.

## Acceptance

1. **C1's clause names the proven mechanism** — and still says plainly what the guard does NOT cover.
2. **C2 chosen and done.**
3. **C3 both** — the id in the file, and the md5 claim carrying its command.
4. **No executable line changes**: prove it the way the last micro-round did — **run the affected scripts before and
   after and show the output is identical**, or show every changed line is a comment. *"Comments only" asserted is
   worth less than "output identical" demonstrated.*
5. `npm run verify` exit 0, `bash scripts/guards/run-all.sh` exit 0, and **`no-bypass-guard.check.mjs` still passes
   its 6 checks** — with tails in the report.
6. **Report committed to `.scratch/v28/reports/slice-6b-micro.md`** with the raw tails.

## Report

**`Committed as: <sha7>` from `git log --oneline -1`**, the corrected clause verbatim, which C2 option you took, and
the identical-output proof for C4.
