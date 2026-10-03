# r3-5 STOP — measurement contradicts the written plan. No implementation attempted.

**Date 2026-10-03. Nothing was edited, staged, or committed. Tree clean.**

The human's stop conditions were:

> Stop immediately if measurement reveals that the written r3-5 plan contradicts an
> existing named decision, if **the card model differs materially from the plan's
> assumptions**, or if another instance of the same defect class appears.

**Two of the three fired**, plus a third the instruction did not name but which makes the
required acceptance pin impossible as written.

---

## TRIGGER 1 — the card model differs MATERIALLY from the plan's assumption

**The plan's `Interfaces` section (written by me) specifies two functions that DO NOT
EXIST:**

```ts
export function previousCard(card: FirstRunCardId): FirstRunCardId | null   // ← not in the tree
export function nextCard(card: FirstRunCardId): FirstRunCardId | null       // ← not in the tree
```

Measured, `rg "^export " src/lib/firstRun.ts` — the module's actual surface:

| export | line |
|---|---|
| `FirstRunCardId` | 15 |
| `FIRST_RUN_CARDS` | 17 |
| `FirstRunFacts` | 25 |
| `SKIPPABLE_CARDS` | 56 |
| `SkippableFirstRunCardId` | 59 |
| `isSkippable` | 62 |
| `nextUnfinishedCard` | 89 |
| `FirstRunView` | 115 |
| `FirstRunState` | 118 |
| `resolveCard` | 147 |
| `progressLabel` | 161 |

**`previousCard` and `nextCard` are absent.** `nextCardIndex` exists but is a **different
concept entirely** — the Places map strip's focus step (`src/lib/mapStrip.ts:56`, tested in
`mapStrip.test.ts`). A grep for the plan's names finds only that unrelated function, which
is exactly the class of near-miss this batch's acceptance-grep guard exists to catch.

**And there is no navigation to guard:**

- **No card passes `onBack`.** `FirstRunCard` accepts `onBack` / `backTo`
  (`FirstRunCard.tsx:56-57`) and renders a `BackControl` when given one (`:94-98`), but
  **no caller supplies it.** `BackControl` is imported by the chrome and used nowhere else.
- **No back/forward handlers exist** on `OnboardingPage`. The only `onBackToList` hits are
  Places-map concerns.
- **The page has no position state at all.** It renders `view` from a single pure call:

  ```ts
  const view = resolveCard(
    { hasProfile: profile !== null, hasKids, hasZip: homeZipSet },
    kidsCardDone ? SKIPPABLE_CARDS : [],
  )
  ```

  `FirstRunView = 'name' | 'kids-pending' | 'kids' | 'area' | 'finish'`. **The card is
  DERIVED from profile facts, never stored.** That is the model, and it is deliberate — see
  Trigger 2.

**So r3-5 is not "add a guard to navigation". It is "build navigation from nothing."**
The plan's own framing ("the page currently renders off a single `resolveCard` answer and an
arrow needs the neighbours") is honest about the *absence*, but the `Interfaces` block
presents design intent as though it were existing structure, and its acceptance criteria
read as if the handlers were merely unguarded.

---

## TRIGGER 2 — the plan CONTRADICTS a named, load-bearing decision

`src/lib/firstRun.ts:80-85` records:

> "A *skipped* optional card IS re-offered while the run is unfinished (a required card is
> still unanswered), because 'skipped' and 'not reached' are indistinguishable from derived
> facts. That is up to two extra taps, on cards that still show Skip, and it is the price of
> not adding a step column. **Do NOT add one.**"

`resolveCard`'s docblock (`:107-113`) adds that the view ladder was moved into the lib
**because** the page had four `if`s encoding a rule — the build law forbids that.

**A backward arrow requires a POSITION, and a position is a step column by another name.**
The plan's answer ("the page holds the position") is exactly the stored-step state the
decision forbids in spirit: once the page can be *behind* a card the profile facts say it
has finished, the derived `resolveCard` model no longer describes the rendered state, and
the two must be reconciled — which is what the "no step column" ruling exists to avoid.

**This is a real conflict with a named decision, not a formality**, and it was not named in
the plan slice. Per the outgoing coordinator's own rule (*"reversals named rather than left
to be discovered"*), it must be surfaced before any edit — as the r3-3 / A14 conflict was.

---

## TRIGGER 3 — the required acceptance pin is not constructible as specified

The human's instruction:

> "Add a behavioral acceptance pin that proves navigation is disabled during an actual save.
> The pin must be capable of failing if the `saving` guard is removed."

**There is no navigation control to pin.** A pin asserting "the arrow is disabled while
`saving`" requires the arrow to exist; building the arrow first means the pin cannot be
written as a guard on existing behaviour — it would be a guard on behaviour written in the
same slice, which is a weaker claim than the instruction intends.

**This is not a reason to skip the pin.** It is a reason to sequence it explicitly: build
the navigation with the guard load-bearing, then pin the guard, then mutate it. That is a
*different slice shape* from the one approved, and it needs the human's word.

---

## The traces requested (measured, so the next reader does not repeat them)

### 1. Card state and transition model

**Derived, not stored.** `view = resolveCard(state, skippedCards)`, where `state` is
`{hasProfile, hasKids, hasZip}` read from the session and `skippedCards` is
`kidsCardDone ? SKIPPABLE_CARDS : []`.

| view | condition (`resolveCard`) |
|---|---|
| `name` | `!hasProfile` |
| `finish` | `hasProfile && hasZip` |
| `area` | kids already skipped |
| `kids-pending` | `hasKids === null` (lazy read unsettled) |
| `kids` | `!hasKids` |
| `area` | otherwise |

Forward transitions are the **write** handlers flipping a fact (`homeZipSet`, `hasKids`) or
the session's skip flag. **There is no backward transition and no position.**

### 2. Previous/next handlers and callers

**None exist.** (Trigger 1.) `FirstRunCard.onBack` / `backTo` are declared and never passed;
`BackControl` has no caller. **Callers: zero, for both.**

### 3. `saving` through the navigation path

**There is no navigation path.** `saving` (`:302`) is the area card's write flag:

| site | use |
|---|---|
| `:897` | `handleAreaFinish` early-returns while `saving` |
| `:1085-1108` | `saveLocation` sets it true / false in `finally` |
| `:1497-1498` | the primary's label and `primaryDisabled` |
| `:1656` | the **zip field** is `disabled={saving}` |
| `:1647` | a comment acknowledging the edit-during-write case |

`saving` is set only by `saveLocation` and cleared in its `finally`, so it re-enables on
**both** the success and failure paths — the pending-state rule's escape already holds here.

### 4. ZIP field state through navigation

`homeZip` (`:299`) is **local page state**, `useState('')`. It is **never read from the
profile** — the profile's zip arrives as `homeZipSet` (a boolean) through `useSessionContext`
(`:250`). The field is rendered only when `zipFallbackShown || homeZip.trim() !== ''`
(`:1630`), and `zipFallbackShown` is cleared/revealed by the address lookup
(`:1034`, `:1042`, `:958`). **So the typed zip dies with the mount**, and the plan's own
comment at `:1621-1626` says that was a **fix**: pre-fix "the field lived and died with the"
card.

### 5. Radius select state through navigation

`radiusMiles` (`:301`) is local `useState(DEFAULT_RADIUS_MILES)`. **The select at
`:1683-1689` is NOT disabled while `saving`** — confirmed by reading it; there is no
`disabled` prop at all. It feeds the map circle (`:1591`) and the write (`:1089`).

**This is the recorded 8d open, exactly as the plan states.** As instructed, **I have
neither widened it nor fixed it.** It is relevant to r3-5 only because a back arrow makes
the divergence more reachable — the plan already records that, and that reachability *is*
part of what Trigger 2 is about.

### 6. What persists / recomputes / stays local

| fact | kind |
|---|---|
| `hasProfile`, `homeZipSet`, `hasKids` | **persisted** (DB, via session context) |
| `kidsCardDone` | **session-local** (the skip flag within one run) |
| `view` | **recomputed** every render from the above |
| `homeZip` (typed), `areaAddress`, `radiusMiles`, `zipFallbackShown`, `areaCoordinates`, `saving`, `error` | **page-local**, die with the mount |

### 7. Implicit UI-lifetime assumptions

- **`areaAddressRef`** (`:336`) mirrors `areaAddress` so the post-`await` resume at `:950`
  can detect "the field moved" — the r2-slice-4 typed-zip/address race fixes. A back arrow
  that unmounts or re-renders the area card **interacts with this ref**; it is the single
  most fragile assumption in the file.
- **`resolveCard` is derived**, so any position state must not *contradict* it — the conflict
  in Trigger 2.
- **Specs:** `onboarding-resume` pins the resume rule; `signup-zip-fallback` pins the
  fallback reveal; `name-card-photo` and `onboarding-kid-photo` pin their cards. **None
  pins a position or a navigation control**, because none exists.

### 8. Founder decisions and recorded opens checked

| decision | where | bearing on r3-5 |
|---|---|---|
| **"Do NOT add a step column"** | `firstRun.ts:80-85` | **CONTRADICTED by a position model** (Trigger 2) |
| `resolveCard` owns the view ladder; a page `if` encoding a rule is forbidden | `firstRun.ts:107-113`; `code-structure.md` | any new position logic belongs in `lib/` |
| The radius select's edit-while-saving divergence | r2 8d open; `plan.md:152,735` | **recorded; NOT touched** |
| A14 / V15 "ping at the very top" | reversed by r3-D1 earlier today | precedent for how a reversal is recorded |

**Nothing observed here is a defect.** `saving` behaves correctly on both paths; the zip
field is already disabled; the derived model is deliberate and documented. **The defect is
in the PLAN, not the code** — the plan describes a model that does not exist and a
navigation contract that was never built, and its Interfaces block presents design intent
as existing structure.

---

## What I need before proceeding

See the question put to the human. **No code was written; the invariant
`navigation is disabled while saving === true, and enabled otherwise` is agreed and
unchanged** — the question is only *what it is attached to*, given there is nothing to
attach it to yet.
