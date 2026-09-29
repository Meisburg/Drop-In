# Fix round 1 — V28 Slice 6 (one blocking finding: the card claims places it does not have)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

Your slice is otherwise strong, and the review verified the hard parts: the **guard
re-key** is right and its **unit test genuinely pins defect #19** (with the honest
caveat that the pin leans on `tsc -b` being in `verify`, which it is); the finish card
is **reachable end to end** both for a zip-having parent and a re-visitor; the ranking
contract is correct and the ordering test **would fail on your inverted first draft**;
`placeHasHours` is exported, tested and used; the empty state **reuses
`RadiusEmptyState`**; `e2e/onboarding-gate.e2e.ts` is untouched (defect #24 safe); and
scope is exactly the 10 files.

## The blocking finding

`src/components/FinishRunCard.tsx:33` defines:

```
body: 'Here are a few real places near you to host a drop-in. Pick one and start from its page.'
```

and passes it **unconditionally** (`:59`). `FirstRunCard.tsx:92-94` renders any non-null
`body`, **always**. So when `picks` is **empty**, the card renders that sentence
**directly above** the shared empty state's *"Nothing within N miles yet."* — the screen
says **"Here are a few real places near you"** and then says there are none. The same
sentence also renders while the card is **still loading** ("here are a few" before it has
found any).

**Why this blocks:** the plan's own pinned bullet says the no-places fallback must make
*"never a claim about drop-ins that do not exist"*, and this batch's entire thesis is
that **the app must not claim what is not true**. This is the second blocking finding of
the batch — and, like the first (a nudge naming cards that did not exist), it is an
**honesty** defect in new copy-bearing UI, not a logic error.

## What to change

1. **Branch the body on the picks state, in the component** (presentation branching —
   build-law-compliant; do not move it into `lib/`).
   - **picks non-empty** → the current sentence is **true**; keep it.
   - **loading** → either **omit the body** (the card already shows
     `'Finding places near you…'`) or use an honest line. Do not assert a count.
   - **empty** → **omit it** or use an honest line; the shared `RadiusEmptyState`
     already says the true thing, so the safest choice is to **not repeat a places
     claim above it**.
   Put the variants as module constants beside the existing object, and pick one in the
   component.
2. **`src/lib/onboarding.ts:63-67`** — the new sentence *"The protected ROUTES still key
   on the zip where the write paths require it"* is a **garbled carry-over of the rule
   2b deleted**: routes do **not** key on the zip any more. What keys on it is the
   **write paths** (`hasHomeZip`, `homeZip.ts:20`). Reword it to say that.
3. **`src/components/FinishRunCard.tsx`** ends without a trailing newline ("No newline
   at end of file"). Fix it while you are in the file.

## Do NOT do these

- **Do not delete or wire `needsOnboarding`** — it is production-dead (your flag was
  correct) but it is **routed to Slice 7a's systematic wire-or-delete sweep**, which now
  has **four** members. Touching it here would be scope creep in a fix round.
- Do not touch `e2e/onboarding-gate.e2e.ts` (defect #24), the guard, the nudge, or
  `firstRun.ts`.
- Do not restructure the card to fix this — branch the body, nothing more.

## Verify

```
npm run verify
# plus every spec that walks this flow — find them by grep, not from a list:
rg -l "finishSignup|first-run-finish-card|Go to your feed" e2e/*.e2e.ts
```

**Check whether any spec asserts the body string** — if one does, it will fail when you
branch it, and the fix is the spec's assertion, not leaving a false sentence in place.
Paste real tails; **lint at 0 errors / 81 warnings** (a second new warning is a
finding); tests against **66 files / 1989 tests**. **The `[setup]` line must be green.**

## Commit and report

```
V28 slice 6 fix 1: the finish card only claims places it actually has
```

```
Status: DONE | BLOCKED
Files changed: <path> <what and why>
The body variants: <quote each variant and the state that selects it>
Specs asserting the body: <what you found, and what you changed>
onboarding.ts:63-67: <the reworded sentence>
Trailing newline: <fixed>
needsOnboarding: <confirm untouched>
Commands run: <real tails; lint vs 81; tests vs 66 files/1989; the [setup] line>
Gate green: yes | no
Commit: <sha>
```
