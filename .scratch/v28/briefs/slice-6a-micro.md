# Slice 6a — MICRO-ROUND: two sentences the review proved false

*(Breaker-adjudicated. **Comment-only change.** Builder + verifier only, deliberately — the reviewer named the exact
sentences and the exact corrections, and no executable line changes, so a third lane would be ceremony.)*

Read `docs/agents/code-structure.md`. Worktree `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`. **Small
edits only — never rewrite a large file in one tool call.**

## Why this exists

The reviewer's last verdict: **"Everything mechanical passes… I could not break [M1-M4, the matrix, the seed-34
premise, the spread measurement] — every one reproduces to the digit. The gap is two sentences about the header's
own numbers, in the slice whose subject is exactly that."** **This slice exists to catch copy that overstates what is
true. It cannot close with its own header overstating what is true.**

## S1 — `:279-282`: "invokes the guard once per seed" is off by one, and the arithmetic is coincidence

The header says it invokes the guard *once per seed*, that its four allowance seeds invoke a **full copy** on top,
and gives *"32 at fix-4 and 33 here."* **Measured by the reviewer:**
- **There are 34 seeds and 33 invocations** — **seed 33 (`check.mjs:949-961`) never calls `run()`**; it inspects
  `guardSrc`. So *"once per seed"* is off by one.
- **The seeds+4 model does not reproduce at the fix-4 commit either: 33 seeds, 32 invocations** — because **the
  allowance seeds' own `run(guardWithAllowlist(…))` IS their invocation, not an additional one.**
- **And *"28 was that fix-4 total minus exactly the four full copies"* is arithmetic that happens to land on 28 —
  which is exactly `dde111a`'s invocation count — not the mechanism.**

**Fix the sentence to the measured relationship, and if the relationship cannot be stated exactly in prose, say
that instead of approximating it.**

## S2 — `:280-281`: the number is still asserted, and "here" is the form this same header forbids

The header says *"33 here, a count the check prints for itself **rather than one this header asserts**."*
**The reviewer: *"it does assert it, and 'here' is the unpinned current-state form the same header forbids at
`:271-273` ('pinned to the commits they were measured at, not to "this tree"'). This is the M2 rot MOVED, not
removed."***

**And `check.mjs:172-174` says *"the guard header quotes neither"* — false for the invocation count.** The reviewer's
note is the sharp one: *"this is the sentence that LICENSES NOT RE-MEASURING"* — **and it sits in the same paragraph
that keeps another unpinned count, `"and 48 ✓ / 0 ✗ on the current tree"`.**

**Apply the header's own rule at `:271-273` to every number in that paragraph: either pin it to the commit it was
measured at, or say where it is computed. No bare "here", no bare "current tree".**

## Acceptance

1. **S1 and S2 corrected to what is measured**, in the guard header.
2. **The `check.mjs:172-174` sentence** made true (it now does quote one of them), **or deleted.**
3. **Every number in that paragraph satisfies the header's own rule** — pinned to a commit, or computed. *Grep the
   paragraph for stray "here" / "current tree" and say what you found.*
4. `node scripts/guards/copy-field-consumption-guard.mjs` and `…check.mjs` both exit 0, **and the check's own
   printed counts are unchanged (48 checks / 33 invocations)** — a comment edit must not move them.
5. `npm run verify` exits 0, **with the raw tail pasted.**

**No executable line may change.** If you find that a fix requires one, **STOP and say so** — that is a finding
about the sentence, not a licence to edit behaviour.

## Report

**`Committed as: <sha7>` from `git log --oneline -1`**, the two corrected sentences verbatim, what the grep in
acceptance 3 found, the check's printed counts before and after, and the `verify` tail.
