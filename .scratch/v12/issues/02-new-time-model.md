# 02: The new time model — /new picks the duration for you

**What to build:** On /new, picking a start slot now picks the duration too:
the default duration is computed from the slot (the "until next hour" logic
the feed already ships — `durationChipForUntilNextHour` /
`suggestedDurationMinutes`, `src/lib/feed.ts:1562` / `:1569`) and shown as
a single value, not a mandatory second tap. The standalone duration-chip
row on the fast path collapses (an override affordance may remain — the tap
budget is the contract, not the absence of an override). Net effect: the
fast path is **3 controls** — place field, picked time row, Post — down
from 4 (the V9 t03 budget counted a duration-chip tap).

**Why:** Founder ask (V12): "I don't want to pick a duration — I want to
post at a time." Duration was the one fast-path input that rarely differs
from a reasonable default.

**Status:** ready-for-agent

## Mechanics (pinned)

- `src/components/PlaydateFormFields.tsx`: the `TimeStepper` component
  (`:1024-1053`; the doc block `:1020-1023`, the `start-time-label`
  `:1041`) is the start-slot control; the duration control it pairs with is
  the `durationBlock` seam in the /new section order
  (`summaryBlock → placeBlock → postAgainSlot → recentChipsBlock → preset →
  describeSlot → kidsSectionSlot → whenBlock → durationBlock →
moreOptionsBlock`, `src/components/PlaydateFormFields.tsx:821-839`,
   `postAgainSlot` at `:823`).
- `src/pages/NewPlaydatePage.tsx`: `quickStartMinutes` `:758`,
  `quickDurationMinutes` `:759`, `quickEndLabel` `:760`; `lastPostClone` /
  `lastPostLabel` `:767-774`, `lastPostClassName` `:778-779`; the
  `postAgainSlot` prop `:1113-1127` (the `post-again` button `:1119`,
  `applyLastPost` `:1120`); the preset prop `:1128-1147`.
- `src/lib/feed.ts` (2354 lines): `PLAYDATE_DURATIONS_MINUTES` `:663`,
  `TIME_STEP_MINUTES` `:666`, `stepTimeMinutes` `:781`, `durationLabel`
  `:798`, `computeStartIso` `:833`, `computeEndIso` `:842`,
  `nextSlotMinutes` `:1530`, `durationChipForUntilNextHour` `:1562`,
  `suggestedDurationMinutes` `:1569`, `clonedStart` `:2284`,
  `cloneLastPost` `:2317`.
- E2E: **21 spec files** import `stepStartTimeOnce` from
  `e2e/fixtures.ts:240` (21 counted at filing; `fixtures.ts` itself defines
  it) — the time-stepper fixture must keep working for all of them. The
  tap-budget spec is `e2e/post-fast.e2e.ts` (V9 t03): it currently counts
  4 controls (place field, picked row, duration chip, Post) and pins the
  touched-control SET exactly — re-pin to 3 (place field, picked row,
  Post). `e2e/post-location.e2e.ts:249` pins the field order — update if
  the order changes.

## Acceptance criteria

1. Choosing a start slot sets the duration automatically (default derived
   from `suggestedDurationMinutes`; still overridable — the override is NOT
   part of the fast path).
2. The fast path on /new is 3 controls: place field → picked time row →
   Post. `e2e/post-fast.e2e.ts` re-pinned 4 → 3 and green.
3. The 21 specs using `stepStartTimeOnce` still pass (the fixture unchanged
   or updated in one place).
4. `e2e/post-location.e2e.ts:249` field-order spec green.
5. `npm run build && npm run test` exit 0; full e2e suite green; lint 0
   errors.

**Migration check:** NONE. `supabase/` untouched.

**Depends on:** none.