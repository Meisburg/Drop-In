# Fix round 1/5 — V28 Slice 1 (fresh-context reviewer findings)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

You built slice 1 at `4660a1b`. A fresh-context reviewer read the diff and
returned **NEEDS_CHANGES**. The orchestrator has adjudicated every finding: four
are accepted, one is rejected. **Take it from here.**

## Hard constraint: this round changes NO production behaviour

`nextUnfinishedCard`'s logic is **correct and verified** — the reviewer
enumerated all 32 fact combinations against the plan's corrected clause (a)/(b)
rule and found no disagreement. **You are fixing a doc comment and adding tests.
Nothing else.**

If you find yourself editing any *logic* in `firstRun.ts`, stop and return
BLOCKED with what you think is wrong. A behaviour change here is out of scope and
would invalidate the review.

## Accepted findings

**1. (blocking) `firstRun.ts:42-53` — the doc block quotes the pre-correction
rule.** Verbatim from the review:

> the doc block cites "THE RULE (pinned in plan.md → Interfaces)" but states
> clause (b) only; clause (a) ("if every required card is answered → null") and
> "`account` counts as answered exactly when `signedIn`" are omitted, while the
> consequence bullet at line 47 ("It terminates: `area` is required and last, so
> answering it ends the run") does not follow from the stated (b)-only rule — the
> code terminates via the unstated clause-(a) early return at line 60. This is
> exactly the self-contradictory draft prose the plan's NOTE FOR REVIEWERS flags
> as the corrected defect.

**Fix:** rewrite the doc block so the rule it states is the rule the code
implements. `plan.md` → Interfaces now pins it as two clauses:

    (a) If every required card is answered, the run is finished → null.
    (b) Otherwise, the first card in FIRST_RUN_CARDS order that is unanswered
        and is either required, or optional with every required card before it
        already answered.
    `account` counts as answered exactly when `signedIn`.

State both clauses, and state the `signedIn` convention. Keep the NOTE pointing
at `plan.md` so a future reader knows which text is authoritative.

**2. (minor) `firstRun.ts:51` — the stale cost figure.** The comment says "one
extra tap"; the plan's corrected text says **"up to two extra taps"** (a parent
who abandoned on `area` after skipping kids and photo is returned to `kids`).
Use the corrected figure.

**3. (minor) `firstRun.test.ts:80-90` — guard order is covered, not pinned.**
Verbatim:

> no test pins guard order: the combinations {signedIn:true, hasName:false,
> hasZip:true} (plan requires 'name') and {signedIn:false, hasZip:true} (plan
> requires 'account') are never exercised, so a mutation moving the
> `if (facts.hasZip) return null` (firstRun.ts:60) above firstRun.ts:56-57 dies
> on no test.

**Fix:** add both cases. They are unreachable in production (a zip implies a
profile row implies a display name), but the contract's clause ordering is the
exact defect class this plan's NOTE FOR REVIEWERS exists for — pin it so a
regression cannot land green. Name each test for the clause it protects.

**4. (minor) `firstRun.test.ts:110-132` — the purity proofs are real but
bounded.** Verbatim:

> the scan is a forbidden-token list (browser globals `location`/`navigator` and
> the `Date()` call form slip through; `location` is domain-relevant), and the
> clock spy's two nextUnfinishedCard samples never traverse the photo/area
> branches, so the spy alone is branch-limited and the scan carries the proof.

**Fix, both halves:**
- Extend the forbidden-token scan with `location` and `navigator` (this module
  is about *places*, so a `location` read is a live hazard, not a hypothetical),
  and with the bare `Date(` call form.
- Make the clock spy traverse **every** branch: enumerate all 32 fact
  combinations under the spy, not two samples. That kills the branch limitation
  and is roughly four lines using the existing `facts()` helper.

## Rejected finding — do NOT act on it

**`firstRun.ts:69` etc. — "all four new files lack a trailing newline, against
repo convention (e.g. `src/lib/a11y.ts` ends in `\n`)."** **Rejected as a
defect: the cited evidence is false.** `src/lib/a11y.ts` does **not** end in a
newline, and a 40-file sample of `src/lib/*.ts` splits **25 with / 15 without** —
there is no uniform convention, so there is no deviation to correct.

It is free to normalize the four files' EOF newlines while you are in them
(zero risk, plurality-consistent), but do not treat it as required and do not let
it drive any other change.

## Do not touch

`plan.md`, `task-state.md`, `.scratch/v28/ledger.md`, `.opencode/`. The
orchestrator owns those.

## Verify and commit

```
npm run verify
```

Paste the real output tail (test count and the GUARDS line). Commit only when
green, message:

```
V28 slice 1 fix 1/5: state the corrected resume rule, pin guard order, widen the purity proofs
```

Do **not** push.

## Report back

```
Status: DONE | BLOCKED
Files changed:
  - <path> <what changed and why>
Commands run:
  - <command> -> <result>   (real output tail)
Behaviour changed: NONE — doc comment and tests only   (or explain, and why)
Commit: <sha>
Risks: <or "none">
Unresolved questions: <or "none">
```
