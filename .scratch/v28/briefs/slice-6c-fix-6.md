# Slice 6c — ROUND 6: implement the human's specification ruling (D-021)

**Working directory:** `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`
**Base:** `1c3471a` (HEAD). Read `docs/agents/code-structure.md` and `factory/decisions.md` **D-019, D-020, D-021** first.
**You are a FRESH builder.** Report to `.scratch/v28/reports/slice-6c-fix-6.md`, written FIRST, appended as produced.

---

## This is not a blind fix round. The human has RULED on the specification.

Round 5 failed (reviewer `NEEDS_CHANGES`) and the orchestrator **did not** start another example-fix round —
it escalated per the standing rule, and the human ruled. **D-020** is the escalation (invariant, detection rule,
15 measured missed shapes), **D-021** is the ruling. Read both. Do not re-litigate them.

**The ruling, verbatim in substance: the reporting form must be made DECIDABLE.**

---

## D-021 item 1 — the centrepiece: a named commit must now be VERIFIED

Today the instrument's *"a wrong named commit"* is a **declared ceiling** — `… at 71bdd55` passes whether or
not `71bdd55` exists, is a commit, or is the tree that was measured. **Close that.**

1. **Define the canonical provenance token** for counts in `.scratch/v28/{reports,briefs}/*.md`: a count's
   provenance is **a commit sha** (7-40 lowercase hex), written in a single canonical form. Decide the exact
   form and write it down in the guard header. If you also support an annotation/directive form, specify it.
2. **Verify the token.** A provenance token naming a sha **must resolve as a commit** — `git cat-file -e <sha>^{commit}`
   (or `git rev-parse --verify <sha>^{commit}`). **A sha that does not exist, is not a commit, or is otherwise
   unresolvable is a FINDING.** That is the decidability win: the rule stops guessing and starts checking.
   - Decide and state what happens when the scan root is **not a git worktree** (the behaviour check runs in
     git-less temp roots — you must not make the rule untestable through its own seam; a check that cannot run
     must not silently pass as if it had, and must not manufacture a false finding).
3. **Broaden the negative half from "phrase" to "token".** Arm 1 (the `N … at <rev>` label) is a set of English
   phrasings and misses the **reverse word order** — a LIVE miss the reviewer measured:
   `.scratch/v28/reports/slice-6b-fix-1.md:292` reads *"at HEAD the corpus reports 90 documents / 7 claims / 97
   quotations"* and the guard returns **PASS**. It also misses `.scratch` in a word class, `/`, `(`, commas, and
   non-`at` prepositions. **Round 4 recorded this exact blind spot and round 5's ceiling list omitted it.** Make
   the detector about the **moving-rev token adjacent to a count in either order**, not about one English
   sentence shape.
4. **Arm 3 is a hand-typed list of eight subcommand names and is wrong in BOTH directions.** It misses
   `git show | wc -l` (327 lines), `git reflog | wc -l` (281), `git blame <file> | wc -l` (55),
   `git annotate <file> | wc -l` (55) — all of which resolve HEAD by saying nothing — and it **fires** on
   `git branch | wc -l` and `git stash | wc -l`, which do not resolve HEAD at all. Fix both directions, or
   replace the list with a rule that is about the property rather than the spelling.
5. **Arm 2 cannot see a global option or a quoted rev**: `git --no-pager log HEAD | wc -l`,
   `git -C <dir> show HEAD:p`, `git -c core.pager=cat show HEAD`, `git show "HEAD"`, `git rev-parse 'HEAD'`.
6. **`git status --porcelain | wc -l`** — a working-tree count that satisfies the invariant but is unflagged.
   The human named "the actual HEAD versus working tree distinction" as part of the class. Decide whether the
   decidable form now covers it; if it stays outside, it must be a **named ceiling with its reason**, not folded
   into a broader exclusion.

## The hard constraint on the decidable half — read twice

**Do NOT make the rule pass by weakening it.** The canonical form is only worth having if a violation of it
FAILS. If you cannot mechanically enforce a part of it, **say so in the header and in the report** — an honest
declared ceiling is worth more than a broad rule that cannot fail.

**Do NOT hand-edit the baseline.** D-021 item 2 requires the **98 current findings to be absorbed by a
RE-DERIVATION** (they are lane reports that discuss the class and therefore quote it). Re-derive, print the new
size at run time, and **never add a key by hand to hide something you just wrote.**

## Also owed from the round-5 review, in this same change

- **Fix the false sentence**: `.scratch/v28/reports/slice-6c-fix-5.md:482` says the same `\b` "silently dropped"
  `HEAD^` and `HEAD@{2}`. **Measured false** — the pre-repair guard flagged those lines with a truncated label;
  only `@` was truly dropped. Correct it to: the `\b` **truncated the token** for `HEAD^`/`HEAD@{}` and **dropped
  `@` entirely**. (The same overstatement is in commit `37b8dd8`'s subject — you cannot rewrite that commit;
  correct the report and note it.)
- **`slice-6c-fix-5.md:512-513` claims both new behaviour checks "can fail"; the control cannot.** With
  `MOVING_REV`'s `@` lookahead removed entirely, that control root still exits 0 — the four control lines are
  unreachable by all three arms. **Make the control able to fail, or declare it is not a control.** A check
  whose named failure mode is unreachable is a claim, not a check.
- **`slice-6c-fix-5.md:93-94` and `:76` print a command that does not produce the result beside it**:
  `git show 99d044f:scripts/guards/factory-guard.mjs | grep -c instrument-headers-honest` prints `0`, measured
  **3**. The `0` came from a two-step `node … --root … | grep -c` command that round 5 dropped when re-pasting.
  Fix the pasted line so a reader can run it and get the number shown.

## Keep the honest parts of round 5 (all reproduced by the reviewer — do not undo)

The `@` arm fix; **every-match-per-line** (`matchAll`); the independent baseline derivation; the **SCOPE block**
(`code-structure.md:121-127` — now the authoritative statement of what is decidable and what is a ceiling); the
reworded `ok —` claim; and the **honest `scheduler.test.mjs` split** (mechanism vs fixture, policy vs
`realConfig`, with D-017's temporary waiver named). `factory/config.json` is the orchestrator's: **do not touch it.**

---

## Verification — run it, report raw tails

1. `node scripts/guards/factory-guard.check.mjs` → exit 0; the run-time counter agrees with an independent count.
   **Add behaviour checks that CAN fail**: a **nonexistent/incorrect sha** must produce a finding; an
   over-matching mutation of the `@`/rev boundary must turn the control red; the reverse-word-order live miss
   (`at HEAD the corpus reports 90 documents`) must fire. Prove each can fail by mutating and showing red.
2. `node scripts/guards/regexp-escape-guard.check.mjs` → exit 0, `all 12 checks passed`.
3. `bash scripts/guards/run-all.sh` → exit 0, `GUARDS: PASS` — **the guard is currently RED with 98 findings;
   it must be green when you finish**, and green by re-derivation, not by deletion.
4. `npm run verify` → exit 0. **RE-MEASURE**: round 5 measured 71 files / 2067 tests / 81 warnings / 0 errors /
   AGENTS.md 1789/1800. Account for every delta. oxlint prints no banner off-TTY — `grep -c ': warning '`.
5. **Demonstrate the new decidability**: show a report with `N at <valid sha>` passing and `N at <bogus sha>`
   failing. Paste both.
6. **Grep your own report with the new rule and paste the output**, empty or not. If it catches you, say so —
   do not weaken the rule.
7. **State the ceiling plainly**: which half is now decidable and enforced, which remains a lexical detector,
   and the exact shapes still missed. The header must agree with the report.

**Commit** per-finding. **Do not push.**

## Report format (`.scratch/v28/reports/slice-6c-fix-6.md`)

Per-finding table with the proving command and raw result. A section on the decidable form: the canonical token,
how it is verified, the not-a-git-worktree behaviour, the new baseline size, and the exact behaviour-check
output including the red-on-mutation proofs. Your measured verify numbers and every delta. The raw verify tail.
The ceiling statement. Anything noticed and not fixed, with `file:line`. **A rejection is allowed if argued from
a measurement** — the orchestrator adjudicates each one.
