# Reviewer brief — V28 r2 slice 6c, FIX ROUND 2 (fresh context, judge the delta)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

You did not write this and you must not assume it is sound. **Everything the builder reported is a claim;
`git diff` and the commands you run are evidence.** Findings must cite `file:line` with the measurement behind
them. **A finding with no reproduction is an opinion — label it as one or drop it.**

## The diff under review

- **Base:** `0205c8d` (an orchestrator ledger commit, report-only) → **`git diff 0205c8d..HEAD`**
- **Slice commit:** `04921d8` — 11 files, `+1753/−92`, not pushed. Working tree clean.

## The round it must satisfy

**`.scratch/v28/briefs/slice-6c-fix-2.md` is the brief. Read it in full** — it carries all eleven findings
verbatim, the orchestrator's ruling on each, and the acceptance items. **The builder reports eleven fixed and
none rejected. Your job is to falsify that claim, finding by finding.**

Round-1 evidence, committed: `.scratch/v28/reports/slice-6c-fix-1-review.md` (the reviewer's own findings) and
`.scratch/v28/reports/slice-6c-fix-1-verify.md` (the verifier's PASS). **`ocr`'s six findings are only in the
brief** — its JSON is gitignored (`.gitignore:112`), deliberately.

## Probe these, do not reason about them

1. **B1 was ruled "DELETE the number, do not replace it with 262".** Did the builder obey, or install a fresh
   stale number? **`260` must appear nowhere in a normative sentence.** Check whether the replacement text
   points at the header's dated figure and names its re-measuring command. **Then run that command** — a
   pointer to a figure is only honest if the figure reproduces.
2. **N1: is the quotation now verbatim and correctly attributed?** Compare `docs/agents/code-structure.md`
   against the record at `.scratch/v28/briefs/slice-6c.md:11-13`. The builder says it also fixed the **same
   false attribution in the guard header**, calling it an adjacent disclosed fix — **check it did not introduce
   a new one there.**
3. **N3/O1/O3 — the premise check, which is where this round is most likely to have gone wrong.** The previous
   builder's dying words were *"the premise check passed on its own error message — a check that cannot fail."*
   **Verify the fix is real:** read the inherited `endsWith` shape's failure mode, then confirm the new
   assertion cannot pass on an error message. **Then BREAK THE GIT STEP** (make `git` unavailable, or make
   `git add` fail) **and confirm: the premise check goes RED, cases after it still RUN, the summary still
   PRINTS, and the exit is 1 with a named failure and no stack trace.** *If an exception escapes, that is the
   finding `ocr` raised and this round claims to have closed.*
4. **The two new probes must be LOAD-BEARING — reproduce the mutations, do not accept the report's proofs.**
   Mutate a copy of the guard and confirm each mutation fails **only** the case it should:
   - a **root-anchored** skip (`.vitest` matched only at the sandbox root) must fail **only** the nested case;
   - `SCAN_EXT` **without `cts`** must fail **only** the `.d.cts` case;
   - `SCAN_EXT` **without `mts`** must fail **only** the `.d.mts` case.
   **A case that is green against the mutation is not pinning anything.** Report the actual case names that
   flipped, from your own run.
5. **The check count is now computed at run time** (`all ${ran} checks passed`). Confirm the number the run
   prints equals the number of assertions actually executed — **a self-reported count that drifts from the
   cases is the exact class this round is about.** Say what you counted and how.
6. **`seedCase()` replaced six per-case blocks.** Confirm every case creates its own parent directory and
   removes its own seed (the asymmetry `ocr` named was case 6 relying on `src/lib` already existing).
7. **Any sentence in the diff that states something other than the mechanism.** That is this batch's
   most-recurring class and this round is *made* of it. Read the new comments, the guard header, the docs
   section and the printed lines as claims about behaviour, and check each against the code.

## Rulings you must NOT overturn

- **The dedupe (5 → 1)**, **`.scratch` staying in `SKIP_DIRS`** (with the reason: `.scratch/guard-a03fc54.mjs:635`
  holds the one-liner), **the `.d.mts` declaration-drift cost**, and **`lib-sibling-guard.sh:72` globbing `*.ts`
  only** — all accepted, out of scope.
- **The deletion of the pinned total** in `slice-6c.md` — that was the orchestrator's ruling over the
  reviewer's own "change it to 262". Judge whether the *replacement text* is honest, not whether deletion was
  right.

## Verdict

**`PASS` | `NEEDS_CHANGES` | `BLOCKED`**, then findings with `file:line` and their reproduction. If you cannot
verify something, say so explicitly rather than passing it. **Do not run `npm run verify`** — the verifier
lane owns the gate.
