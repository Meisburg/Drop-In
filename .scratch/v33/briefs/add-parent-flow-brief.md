# B2-2: add-parent-flow — SENTINEL ADD-PARENT-FLOW-C3K7

## The founder's words (annotation `mv0d7dwh`, /profile, 2026-10-09)

Jon reports the "add a parent" interaction on `/profile` is confusing — it is
not obvious how a second parent gets added.

## What is there today (grounded)

`src/pages/ProfilePage.tsx` — the "The parents" section renders **only real
parent cards**. Each card carries a save button whose idle verb comes from
`parentCardSaveLabel` (`src/lib/parentCards.ts`), which returns **"Add parent"**
when the card is blank. There is **no separate "add another parent" affordance**;
the availability of a second parent is implied by an empty card existing.

The confusion: the only control that says "Add parent" is *inside a card*, so it
reads as the whole-section action. A parent who already added themselves does not
see a labelled way to add their partner.

## ORCHESTRATOR DECISIONS (do NOT re-litigate — the cap question is ANSWERED)

**D0 — THE CAP STANDS AT 2. Do not raise it.** The 2-parent cap is a shipped
product decision, enforced in three places; raising it is a schema change for a
different slice:
- `MAX_PARENT_CARDS = 2` (`src/lib/parentCards.ts:15`);
- a DB CHECK on `position` + unique index (migration 0047), pinned by
  `e2e/account-links.e2e.ts:174-187` ("a THIRD card must be refused by the database");
- `parentCardList` slices to 2 and `nextParentPosition` returns `null` once both
  slots are taken (`parentCards.ts:43`, `:54-60`);
- `PARENT_CARDS_BLURB` already reads "Up to two parents…".
This slice makes the SECOND parent easy to find. It never offers a third.

**D1 — The button verb names what it does, by position.**
- The **first** card's button is **"Add parent"** (unchanged — it IS the section's
  primary action when no parent exists yet).
- Any **subsequent** card's button reads **"Add another parent"**.
  Implement by passing an index/`isFirst` into the card render path so
  `parentCardSaveLabel` (or its caller) can choose the verb. Keep the pure
  function's existing signature and default behaviour; add the position as a
  parameter rather than duplicating the label string.

**D2 — ONE explicit affordance at the end of the list.**
A single button below the cards: **"+ Add another parent"**
(`data-testid="add-another-parent"`). It appends an empty card. It must:
- hide itself when a blank card is already on screen (no two empty cards);
- **hide once both slots are taken** (the cap is 2 — the affordance is honest about
  what is still possible);
- append + focus the new card's first (Name) field (do not leave focus on the button).

**D3 — No schema change, no new screen, no route.**
The cards, their slots, the save path, and `parentCards.ts`'s validation are
untouched except for the position-aware verb. Do NOT restructure the section.

## Files

- `src/pages/ProfilePage.tsx` — the "The parents" section: position-aware verb +
  the "+ Add another parent" button.
- `src/lib/parentCards.ts` — accept the position so the verb is not duplicated
  (do NOT touch `MAX_PARENT_CARDS` or the cap logic).
- `src/lib/parentCards.test.ts` — cover first-vs-subsequent verb.
- e2e: a spec that adds a second parent — the button says "Add another parent",
  the new card appears, saving persists, keyboard-reachable, AND the affordance is
  gone once two named parents exist.

## Acceptance

1. Blank profile: the one card's button says "Add parent" (unchanged).
2. After a first parent exists: a "+ Add another parent" button is visible
   (`add-another-parent`), and adding a card shows its button as
   "Add another parent".
3. The affordance hides while an empty card is already present AND once two named
   parents exist. **A third parent is never offered.**
4. Keyboard-reachable; focus lands on the new card's Name field.
5. No second screen or route is introduced.
6. Gate: typecheck + `npm run verify` (steering-lint's 3 stale pointers are the
   only permitted red) + units + `e2e/account-links.e2e.ts` + the profile-parents
   spec on a private port, BOTH `BASE_URL` and `E2E_BASE_URL` set.

## STOP condition

None remain — the cap question is answered above (D0). Do the work.

Work in the worktree the factory gives you. Do NOT run the long e2e suite in the
foreground: make the code change, run typecheck + the unit test, then commit and
report. The controller runs the full gate.