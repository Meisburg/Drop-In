# Slice 6 — The finish card, and the guard re-key that makes it reachable

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

Read `plan.md` → **Slice 6** (read it fresh), then `docs/agents/code-structure.md`.
Slices 1–5 are done and verified: a new parent signs up, lands in the interview,
fills kids and a photo, sets an area — **and all five cards now exist.** The run
currently ends by landing on the day-1 feed.

Two jobs, and **the second is what makes the first visible at all.**

## Job 1 — the finish card (decision 12)

Its own card at the **end** of `/onboarding`: **up to three real places near the
parent** (places with hours preferred), each offering a path to host a drop-in
there. Render it when the run is over — `nextUnfinishedCard(facts) === null`.

**Reuse, do not invent:**
- **The places read already exists — find it and reuse it; do NOT add a query
  shape.** Measured: it is a Supabase query in **`src/lib/db.ts`** (`:680-690` are
  the nearest shapes), **not** a function in `src/lib/places.ts` — that module holds
  the *formatters* (`placePath`, `placeKindLabel`, `placeKindChips`, …). **If the read
  you need lives in `db.ts`, then `db.ts` is in your scope — say so in your report.**
- **The honest empty states already exist**: `LocationRequiredNotice`
  (`src/components/LocationRequiredNotice.tsx:20`) and `RadiusEmptyState`
  (`src/components/RadiusEmptyState.tsx:72`, which 2c taught to render the notice for
  a no-zip viewer). Do not write a third one.
- The directory's `Place[]` shape and the radius/zip props it takes
  (`PlaceDirectory.tsx:197-204`, `:304`) show what the card needs.

**Acceptance:**
- With places nearby, the card shows **at most three**, each linking to a real place.
- With none nearby, it falls back to the flow's **honest empty state** and still
  offers a next step — never a blank screen.
- **The card makes NO claim about upcoming drop-ins.** Measured at planning time: the
  live DB had **0 upcoming drop-ins**; the honest line is that there are none yet.
- Reaching this card **ends the run** (`nextUnfinishedCard(facts)` is `null` after).
- **`finishSignup` passes through the finish card to reach the feed** — it has **17
  consumers**, so walk it in this slice.

## Job 2 — ⚠️ RE-KEY THE GUARD (plan defect #19; the ending is unreachable without it)

Measured: `OnboardingPage.tsx:263-264` renders `<Navigate>` when
`resolveOnboardingRedirect` returns non-null, and `src/lib/onboarding.ts:61+` returns
`HOME_PATH` whenever `homeZipSet` is true. **The area card is card 5 of 5, so writing
the zip creates exactly that state** — the parent is bounced to the feed **before the
next card can render**, and `finishSignup` could never pass through it.

**Re-key it in this slice:** signed out → `LOGIN_PATH`; **otherwise `null` (render)**.
The `(signed in + zip set) → HOME_PATH` branch goes, and its docblock says so. A
parent who finished and re-visits `/onboarding` then lands on the **finish card** —
that is the intended ending, not a bug.

**Update `src/lib/onboarding.test.ts:56-67` in this same slice** — it pins
`(true, true) → HOME_PATH` at `:63`. A spec that pins behaviour you change is your
obligation.

## ⚠️ PLAN DEFECT #24 — DO NOT TOUCH `e2e/onboarding-gate.e2e.ts`

**My plan's Slice 6 file list names that spec on a FALSE premise.** Verified: it
contains **one** test — *"a cold full-page `/profile` load lands on `/profile` (no
onboarding-gate bounce)"* — and it pins **`resolveOnboardingGate`'s `'loading'`
outcome**, **not** `resolveOnboardingRedirect` (`rg` finds no reference to that
function in the spec at all). That `'loading'` outcome is **2b's cold-load race fix**.

**So: leave it alone.** If your change breaks it, **STOP and report** rather than
"updating the pin" — weakening it is exactly the failure 2b's builder was warned
about. The only pin on `resolveOnboardingRedirect` is the **unit test**.

## ⚠️ Find the specs your change breaks — BY GREP, not from my list

Three times this batch, a renamed UI string or a new card left a spec waiting on
something that no longer renders, because the brief named files instead of grepping.
**So grep and fix them in this slice:**

```
rg -l "finishSignup|first-run-|Near you|Set your location|onboarding" e2e/*.e2e.ts
```

Any spec that walks this flow is in your scope when your change breaks it. A broken
spec **is not deferred** — that is the rule that cost the last slice a fix round.

## Also

- **The resume nudge stays GENERIC.** Do not add this card's title to it (defect #20's
  ruling: the generic line is never wrong, and naming a card couples the shell to the
  card inventory).
- **Do not re-key the nudge, `firstRun.ts`, or the gate functions you are not told to.**

## Verify

```
npm run verify
npx playwright test e2e/onboarding-gate.e2e.ts e2e/golden-path.e2e.ts
# plus every spec your grep found
```

Paste real tails. **Lint is expected at 0 errors / 81 warnings** — a **second** new
warning is a finding. Tests are expected at **66 files / 1982 tests**; if you add
tests say the new number and why. **The `[setup]` line must be green.**

**If the card, the re-key and the spec walk cannot fit one context, STOP and report
with the partial diff rather than committing a half-moved ending.**

## Out of scope

`e2e/onboarding-gate.e2e.ts`, `src/App.tsx`'s nudge, `src/lib/firstRun.ts`, the
deleted machinery's remains, `/browse` and the place detail pages (**the card links
into them; it does not rebuild them**), `plan.md`, `task-state.md`, `.scratch/**`.

## Commit and report

```
V28 slice 6: the finish card, and the guard that made it unreachable
```

```
Status: DONE | BLOCKED
Files changed: <path> <what and why>
The finish card: <the read you reused and where it lives; the three places; the empty state>
The guard re-key: <the new body; what the unit test now pins>
onboarding-gate.e2e.ts: <confirm untouched, and green>
Specs found by grep: <the list, and each one's outcome>
Nudge: <confirm still generic>
Commands run: <real tails; lint vs 81; tests vs 66 files/1982; the [setup] line>
Gate green: yes | no
Commit: <sha>
Risks: <or "none">
Unresolved questions: <or "none">
```
