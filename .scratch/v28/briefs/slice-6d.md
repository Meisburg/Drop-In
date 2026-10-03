# Slice 6d — the repo-wide honesty guard (and where the climb has to stop)

> ## ⚠️ RE-MEASURE BEFORE YOU TRUST ANY LINE NUMBER BELOW
>
> This brief was written several slices ago and **the anchors have already drifted once** — `FIRST_RUN_COPY` moved
> from `:27` to `:75` and `FIRST_RUN_NUDGE_COPY` from `:71` to `:123` because another slice edited that module.
> **Identifiers are stable; line numbers are not.** Find each item by its symbol first, then confirm the line, and
> **report which numbers you had to re-measure**. `push.ts:63`, `theme.ts:94` and `feed.ts:186,199` were verified
> unchanged; `verify.yml:24-25` is the CI quote about the database module.
>
> **⚠️ And if an item is ALREADY FIXED, say so rather than re-fixing it.** An item that is already done is evidence
> about this brief, not work for you.



*(The last of the four subjects slice 6 was split into. **This is the one that may not fit** — read the last
section before you plan anything.)*

You are `orchestrator-builder`. **Read `docs/agents/code-structure.md` before writing.** Worktree
`/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.

## Why this exists, in slice 5's own words

Slice 5 mechanically pinned **one class of dishonesty for ONE card**: *"copy must not assert content that is not
there."* Shipped on that card, and each was caught by a lane rather than by the author:

- **"parks and playgrounds, and see their hours"** — `kind='park'` holds **ZERO rows** (measured today; the app
  withholds that chip *because* it is empty) and **55 of 239 rows have no hours**, with **164 of the 184 that do
  being labelled citywide "typical hours"** rather than venue schedules.
- **"along the bottom"** — the nav is a bottom bar below `md` and a **sticky left rail** above it, so the card
  *whose entire job is telling a new parent where the controls are* was **wrong on every tablet and desktop**.

Its closing note: *"the climb is a repo-wide guard (every copy module declares its claims, every claim is checked
against a live count); slice 6's `FIRST_RUN_COPY` field guard is the nearest existing hook."*

## ⚠️ THE CONSTRAINT THAT DECIDES THE DESIGN — measured, and it rules out the obvious shape

`.github/workflows/verify.yml:24-25`: *"`src/lib/db.ts` throws at module load without them, so `npm run build`
and `npm test` both fail. **MEASURED, not guessed.**"* **So anything that reaches the live database inside the gate
adds a live-data dependency to CI, and a guard that goes red because the network or the database is unavailable is
a guard people learn to ignore** — which is the batch's own recorded rule: *"a known-noisy channel must not become
a channel you stop reading."*

**RULED — two tiers, and you must state which tier each claim lands in:**

- **Tier 1 — deterministic and offline, and it belongs IN the gate.** Every copy module that names a **taxonomy
  category** declares its claims, and each claim is checked against **the taxonomy constants the app itself
  uses** — the mechanical climb of slice 5's local guard. *"A category this copy names must exist, and must not be
  one the app withholds."* **No network, no database, no clock.**
- **Tier 2 — the live-count half, and it does NOT go in the gate by default.** A **script** (not a guard) that
  checks declared count-claims against live counts and **writes a dated report**. **If you put its result in the
  gate, the gate must depend on nothing but the COMMITTED report** — and then you owe a ruling on the report's
  **age budget**, because a committed count that quietly rots is *exactly* the defect the reviewer found in slice
  5: *"the dated counts are unpinned and can rot with the suite green."* **If an age budget means red CI on a
  timer, say so and prefer the honest limit over the noisy gate.**

## What you must enumerate first (measured today — reproduce it)

| Module | Copy it holds |
|---|---|
| `src/lib/firstRunCopy.ts:75` | `FIRST_RUN_COPY` (the r2 first run)  **[RE-MEASURED: was `:27` when this brief was written; slice 6a moved it]** |
| `src/lib/firstRunCopy.ts:123` | `FIRST_RUN_NUDGE_COPY`  **[RE-MEASURED: was `:71`]** |
| `src/lib/firstRunTour.ts:229` | `TOUR_BANNED_COPY` + the tour lines (slice 5's local pin) |
| `src/lib/push.ts:63` | `NOTIFICATION_KIND_COPY` |
| `src/lib/theme.ts:94` | `THEME_CHOICE_COPY` |
| `src/lib/feed.ts:186,199` | `RADIUS_SAVE_REJECTED_COPY`, `RADIUS_SAVE_FAILED_COPY` |

**`rg -l "Copy|COPY" src/lib/*.ts` is the starting set, not the answer** — enumerate it yourself, and **say which
modules you EXCLUDED and why** (several are comment matches, not copy). **Coverage is a claim like any other.**

## ⚠️ Scope, and the permission you already have

Slice 5's escalation said plainly: *"the full climb may not fit alongside `skipLabel` and your two guards. **If it
does not fit, STOP and report which parts you did**, and I will split it. **A guard that pretends to be total is
worse than one that says what it covers**, and this batch has already ruled that twice."*

**That permission is live and it is not a formality.** Two r2 slices were split **after** being dispatched because
they did not fit. **An honest partial climb, with its boundary written down, is a PASS. A total-looking guard with
a hole is a FAIL** — and I will send it back.

## Acceptance — demonstrate each, both halves

1. **The declaration mechanism**: copy modules declare their claims, in a form the guard can read, **documented in
   the guard's header**. Show one real declaration.
2. **The guard passes on the current tree** — including on slice 5's own tour card, **whose copy was made true by
   measurement**. If it cannot pass there, the guard's rule is wrong, not the copy.
3. **It fails on a seeded violation** — put a withheld category (or a non-existent one) into a copy module, show
   the red, restore it, **paste both outputs.**
4. **Its `.check.mjs` proves the checker fires** — *"a checker that matches nothing looks exactly like a clean
   repo"* — and it exits 0 when run directly.
5. `run-all.sh` registers it **in both places** (`for guard in …` at `:61`, and the `run_check` block at
   `:85`/`:100-103`), and `.check.mjs` never `.test.mjs`.
6. `npm run verify` exits 0 — **and say whether the gate gained any dependency on the clock, the network or the
   database. If it did, that is a finding about this slice.**
7. **Your coverage statement**: which modules and which claim kinds are in, which are out, and why.

## Verify

`npm run verify`, plus the new `.check.mjs` directly, plus the Tier-2 script if you built one (show it running with
**no** live access too, so its failure mode is known).

**Four named flake modes** — re-run once before believing any red: `no-bypass-guard`,
`e2e/places.e2e.ts:2759`, vite-4173 / trace-artifact-ENOENT, teardown `close()` throwing *"Target page, context or
browser has been closed"*. Kill listeners **by port**, never `pkill -f`.

## Report

- **`Committed as: <sha7>`** — or *"not committed"* and why; **an absent field is read as evidence.**
- Files changed with `+/-` counts.
- **Which tier each claim kind landed in, and the coverage statement** — in the report **and** the commit.
- Both halves of every acceptance run: **raw output tails.**
- `npm run verify`: exit code, test-file count, test count, lint errors **and warnings**.
- **If you stopped short: say exactly where, and what you did not do.** That is the expected outcome if the climb
  is bigger than one context, and it will be split rather than penalised.
- Anything the brief did not anticipate — **say it rather than quietly fixing it.**
