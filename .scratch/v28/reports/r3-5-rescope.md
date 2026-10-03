# r3-D2 — r3-5 RE-SCOPED: build first-run navigation, guard load-bearing

**Decided by the human 2026-10-03**, after the measurement stop
(`r3-5-stop.md`) found that the written slice described a model that does not exist.

## What was wrong with the slice as written

1. `previousCard` / `nextCard` were specified in the plan's `Interfaces` block as
   though they existed. **They do not.** (`nextCardIndex` is the Places map strip's
   focus step — unrelated.)
2. **No navigation exists at all.** `FirstRunCard` accepts `onBack` / `backTo`; no
   caller passes either, and `BackControl` has zero call sites. The page stores no
   position: `view` is DERIVED by `resolveCard` from profile facts.
3. So the required acceptance pin — "navigation is disabled during an actual save"
   — had nothing to attach to.

## The human's ruling

> **Re-scope r3-5 as "build first-run navigation, with the saving guard load-bearing".**

Build pure ordered navigation in `lib/firstRun`, wire `onBack` into the chrome,
hold position in the page, disable navigation while `saving`, then add and
mutation-test the pin.

## The invariant, unchanged

**`navigation is disabled while saving === true, and enabled otherwise.`**

It is the SAME invariant as the original slice. Only what it attaches to changed.

## ⚠️ The "no step column" decision — how this respects it

`firstRun.ts:80-85` says: *"'skipped' and 'not reached' are indistinguishable from
derived facts... **Do NOT add a step column.**"*

**This slice does NOT add a profile column, a migration, or any stored step.** The
position is:
- **in-memory, per mount** — a `useState` on the page, exactly like `homeZip`,
  `areaAddress` and `radiusMiles`, all of which already die with the mount;
- **derived-forward, explicit-backward**: `resolveCard` remains the ONLY authority
  for what a parent has ANSWERED; the position only ever moves a parent
  **backward** to a card already visited, and forward returns to `resolveCard`'s
  answer. It can never make the run finish differently;
- **never persisted**, so `nextUnfinishedCard`'s rule (resume never restarts) is
  untouched. A reload lands on `resolveCard`'s answer, not on a remembered arrow.

**The reconciliation is explicit and pinned:** `position` is `null` by default,
meaning "render `resolveCard`'s answer" — the derived model is the DEFAULT, and the
arrow is an override that only a tap can create within one mount.

## Scope

- `src/lib/firstRun.ts` (+ its test): the pure ordered neighbours, reading
  `FIRST_RUN_CARDS` and never a literal index (the rule `progressLabel` already obeys).
- `src/pages/OnboardingPage.tsx`: position state + the handlers + the guard.
- The chrome wiring (`onBack`) for the cards that can show it.
- A pin proving the guard, mutation-tested.

## Explicitly NOT in scope

- **The radius select's edit-while-saving divergence** (r2 8d open). Recorded, NOT
  widened, NOT fixed. If measurement shows r3-5 cannot complete without touching it,
  **STOP AND REPORT** — that is the instruction.
- Any change to `resolveCard`'s answered/unanswered rules.
- r3-6 work (deleting the ending screen).
