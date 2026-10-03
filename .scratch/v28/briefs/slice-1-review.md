# Reviewer brief — V28 Slice 1

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

You are a fresh-context reviewer. You did not write this code and you must not
assume it is right. Your job is to judge **one diff against one plan slice**.

## What you are reviewing

- **The diff:** commit `4660a1b` (parent `15ada15`). Four new files:
  `src/lib/firstRun.ts`, `src/lib/firstRun.test.ts`, `src/lib/firstRunCopy.ts`,
  `src/lib/firstRunCopy.test.ts`.
- **The contract:** `plan.md` → the `Interfaces` section, and Slice 1. Read both.
  The Interfaces block is the authoritative contract and was **just corrected**
  (the resume rule is now clauses (a)/(b) — read it as it stands on disk, not as
  any summary describes it).
- **The build law:** `docs/agents/code-structure.md`.

Start with `git show 4660a1b` and read every line of all four files. This is a
small diff; there is no excuse for sampling it.

## The questions you must answer

1. **Semantics.** Does `nextUnfinishedCard`'s implementation match the plan's
   corrected rule, clause for clause, for every combination of the five facts?
   Enumerate the cases in your head — there are only 32. Name any input where
   plan and code disagree, with `file:line`.
2. **Can the tests fail?** A test that cannot fail is not a test. For each
   acceptance criterion in plan.md's Slice 1, identify the test that pins it. If
   any criterion is unpinned, say which. The builder claims a mutation check
   killed two named tests — judge whether the test file makes that plausible, and
   whether the *rest* of the rule is equally mutation-proof or merely covered.
3. **Doc/contract drift.** Does every doc comment in the shipped files state
   something the code actually does? Specifically: does the `nextUnfinishedCard`
   doc comment now agree with the code beneath it? Quote any comment that
   promises behaviour the code does not have.
4. **The purity claim.** Two proofs are asserted (a `?raw` source scan and a
   `Date.now` spy). Are they real proofs, or do they pass vacuously? Could a
   future edit add a client or a clock and leave them green?
5. **Consumer readiness.** Slices 3a–6 will render these cards and call
   `progressLabel`/`nextUnfinishedCard`/`isSkippable`, and Slice 3b needs the
   name card to keep a `/^Continue/`-matching label (the shared e2e helper
   depends on it). Is anything in this module shaped so that a consumer will be
   forced to change it — a missing export, an awkward seam, a label that will
   drift?

## Rules

- Findings must cite `file:line`. A finding without a location is an opinion.
- Judge the diff against the slice. Do **not** report pre-existing repo lint
  warnings or unrelated files — that is out of scope and will be discarded.
- Do not edit anything. You are read-only.
- If the slice cannot be judged because the plan is ambiguous, return BLOCKED
  and name the ambiguity rather than guessing.

## Verdict

Return exactly this:

```
Verdict: PASS | NEEDS_CHANGES | BLOCKED
Findings:
  - <severity: blocking | minor> <file:line> <what is wrong>
    why it matters: <one line>
Evidence checked: <what you actually read/ran, so the orchestrator can audit you>
```
