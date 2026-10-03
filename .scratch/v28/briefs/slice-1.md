# Builder brief — V28 Slice 1 (the pure first-run model)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**
(branch `Meisburg/onboarding`, base `15ada15`). Every command below runs from
there, not from the main checkout.

## Read first

1. `plan.md` — **the "Interfaces" section and Slice 1 only.** The Interfaces
   block is the contract; it is not negotiable.
2. `docs/agents/code-structure.md` — the build law (domain logic in `src/lib/`
   as pure functions, every `lib/*.ts` ships a `lib/*.test.ts` sibling).
3. `src/lib/vibeChips.ts` + `src/lib/vibeChips.test.ts` — the precedent for a
   small tested module of labels-as-data. Match that shape.

## The slice

Create the pure first-run model. Four files, all new:

- `src/lib/firstRun.ts` — `FirstRunCardId`, `FIRST_RUN_CARDS`, `FirstRunFacts`,
  `isSkippable`, `nextUnfinishedCard`, `progressLabel`. Exact signatures are in
  `plan.md` → Interfaces. Copy them.
- `src/lib/firstRun.test.ts` — the sibling test.
- `src/lib/firstRunCopy.ts` — card titles, bodies and button labels as data.
- `src/lib/firstRunCopy.test.ts` — the sibling test.

**No UI. No React. No page edits. No other files.** If you believe this slice
needs a file outside these four, STOP and return BLOCKED — do not expand scope.

## Non-negotiables

- **TDD.** Load the `tdd` skill. Write the failing tests first, watch them fail,
  then make them pass. The acceptance criteria below are the red state.
- **Purity is a requirement, not a preference.** `firstRun.ts` must not import
  any Supabase client, read a clock, or touch `window`/`localStorage`. A test
  must prove it.
- **Mutation-check the resume rule** (the plan demands it). Flip
  `nextUnfinishedCard`'s rule, confirm a *named* test dies, then restore it.
  Report which test caught it. A rule with no test that can fail is not tested.
- **The copy seam is plain data.** No JSX, no components, no formatting logic
  beyond interpolation.

## Acceptance criteria (from plan.md — the red state)

- `FIRST_RUN_CARDS` is exactly `['account','name','kids','photo','area']`, in
  that order.
- `isSkippable` is false for `account`, `name`, `area`; true for `kids`, `photo`.
- `nextUnfinishedCard({signedIn:false, …})` is `'account'`.
- `'name'` when signed in with no name; `'kids'` when name is set and kids is
  not; `'photo'` when kids is set and photo is not; `'area'` when photo is set
  and zip is not; `null` only when **name and zip are both set**.
- A parent who never sets `hasKids` still terminates: with name and zip set, the
  result is `null`.
- `progressLabel('photo')` is `'4 of 5'`.
- The module imports no client, reads no clock, touches no browser global.

The rule in prose, for the cases the table above does not spell out:
**the first card in order that is unanswered AND is either required, or optional
with every required card before it already answered.**

## Verification command

```
npm run verify
```

`npm run verify` is `build && test && lint && a11y:focus && steering-lint &&
guards`. Run it from the working directory. Paste the real tail output (test
count, warning/error counts, guard results) in your report — the exit code
alone is not evidence.

If GUARDS fails on a git-related error, that is an environment fault, not your
code: report it under Risks with the exact output rather than working around it.

## Commit

Commit your work on this branch when and only when `npm run verify` is green:

```
git add -A && git commit -m "V28 slice 1: the pure first-run model"
```

**Do not push.** Do not touch `plan.md`, `task-state.md`, `.scratch/v28/ledger.md`
or anything under `.opencode/` — the orchestrator owns those.

## Report back (exactly this shape)

```
Status: DONE | BLOCKED
Files changed:
  - <path> <one-line summary>
Commands run:
  - <command> -> <result>          (include the real output tail)
Mutation check: <which named test died when the rule was flipped>
Commit: <sha>   (or "none — blocked")
Risks: <or "none">
Unresolved questions: <or "none">
```
