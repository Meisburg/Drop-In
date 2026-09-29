# Slice 3a — The card shell and the name card

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

Read `plan.md` → Slice 3a first (**the orchestrator amended it — read it fresh**),
then `docs/agents/code-structure.md` (the build law). Slice 1's pure model is at
`src/lib/firstRun.ts` (committed, verified); slices 2a–2c are done.

This is the first slice that **builds the interview** rather than moving a
requirement. Two halves: a presentational card, and the seam that renders the
first run bare.

## What already exists (measured — do not re-derive)

- `src/lib/firstRun.ts` — `FIRST_RUN_CARDS`, `FirstRunCardId`, `FirstRunFacts`,
  `isSkippable(card)`, `nextUnfinishedCard(facts)`, **`progressLabel(card)`**
  (`progressLabel('name')` is `'2 of 5'`). Pure, tested. **Use it — do not
  hard-code '2 of 5' or re-implement the order.**
- `src/pages/OnboardingPage.tsx` is **582 lines**. The name branch is the
  `if (profile === null)` block at **lines 307-372**: a masthead `<header>`
  ("What's your name?") plus a `<form>` with First name / Last name inputs and a
  submit button whose label is `{handleBusy ? 'Please wait…' : 'Continue'}`
  (**line 369**). That label must keep matching `/^Continue/` — shared e2e helpers
  locate it that way.
- `CreateProfile` logic already exists and must not change:
  `displayNameFieldError(first, last)` (line 280), `composeDisplayName` (285),
  `await createProfile(name)` (289), `HandleTakenError` (293).

## Half 1 — `src/components/FirstRunCard.tsx` (new)

A presentational card chrome: an optional back control, a progress label, a
title, body copy, a children slot, a primary action, and an optional Skip.

**The build law applies with force: React renders, it does not decide.** The
component must carry **no domain logic** — no zip rules, no handle rules, no kid
rules, no knowledge of card order. It takes props and renders them. Whether a
card is skippable is decided by the caller via `isSkippable`; the card just draws
the Skip control when told to.

Requirements:
- The primary action's label is a **prop** (so the caller keeps `Continue`).
- Tap targets ≥44px (`min-h-11` is the app's idiom), inputs ≥16px.
- A visible focus cue on every control (`focus-visible:ring-2 …` — `npm run
  a11y:focus` enforces this and is part of the gate).
- No new dependency, no routing decisions inside it (a "back" control takes a
  callback or a link prop, it does not call `navigate` on its own judgment).

## Half 2 — `src/pages/OnboardingPage.tsx`

1. Wrap the existing name branch (**307-372**) in `FirstRunCard`, labelled with
   **`progressLabel('name')`** — do not write `'2 of 5'` literally.
2. **Generalize the branch; do not rewrite it.** It already exists for first-time
   social sign-in, and its validation, error surface (`role="alert"` +
   `fieldA11y`/`errorId` seams) and `HandleTakenError` handling must all behave
   exactly as today.
3. **Keep a `/^Continue/`-matching primary label.**
4. Fix the stale claim at **`OnboardingPage.tsx:40-41`**: *"The step is REQUIRED: a
   signed-in user without a home zip is gated to this page (the shell's onboarding
   gate keys on home_zip)."* Nobody is **gated** here any more — slice 2b removed
   the wall and the page is voluntary (`docs/adr/0001-home-zip-stops-being-a-gate.md`).
   The step is still required **to finish the run**; it is no longer a gate on the
   app. Say that, and keep the rest of the docblock's useful content.

## Half 3 — the bare-render seam (decision 16), in `src/App.tsx`

⚠️ **The plan used to say an `isFirstRun` constant "already exists". It does not.**
Measured: `App.tsx:205` is an **inline** `pathname === ONBOARDING_PATH` in the
redirect branch, and that is the only occurrence. Create the constant and use it
in both places, so there is still exactly one comparison.

Suppress, for `/onboarding` only:
- the `<header>` (`App.tsx:232`)
- the `<nav>` bottom bar / rail (`App.tsx:280-304`)
- `PushOptInPrompt` in `<main>` (`App.tsx:319`) — **this is decision 10's
  mechanism**; do not add a second flag for it
- the first-run resume nudge — that arrives in slice 3b; there is nothing to do
  for it here, but the seam should be shaped so 3b can hang it off the same
  constant.

### ⚠️ The trap this seam can spring — do not re-introduce it

`App.tsx:228-229` derives the two-column grid
(`md:grid-cols-[4.5rem_minmax(0,1fr)]`) from **`session !== null`**, and
`App.tsx:306-311` derives `<main>`'s `6rem` bottom padding the same way. On
`/onboarding` the session **is** non-null — so if you suppress the rail and leave
the column definition alone, **column 1 is empty**, which is precisely the bug
`App.tsx:213-225` documents: it **collapsed `<main>` to 72px on a 1024px
viewport**.

**Derive the grid column and the nav's bottom padding from whether the nav
actually renders** — one condition, used in all three places — and give the first
run its own padding so the card is not sitting above 6rem of nothing.

**Do not reorder or restructure any guard above this point.** The `/mod` guard,
the post-edit fallback and the `I'm coming` return target are ordered
load-bearingly and comment-documented. The seam is a **render** decision, not a
routing one.

## Acceptance criteria

- The name card creates the profile row exactly as today
  (`createProfile(composeDisplayName(...))`), including the `HandleTakenError`
  message on a taken name.
- The name card is labelled `2 of 5` **via `progressLabel('name')`**.
- `FirstRunCard.tsx` carries no domain logic.
- `/onboarding` renders with **no header, no bottom nav and no push prompt**, and
  **every other route's chrome is byte-identical to before**.
- **At md+ on `/onboarding`, `<main>` is full width** — not 72px. Say in your
  report how you checked this (the grid class you now render).
- Tap targets ≥44px, inputs ≥16px, errors use `role="alert"` with the shared
  `fieldA11y`/`errorId` seams.
- `npm run verify` green.

## Verify

```
npm run verify
npx playwright test e2e/golden-path.e2e.ts
```

The golden path signs up and walks to the feed — it does **not** visit
`/onboarding` (nothing does yet). It is your regression proof that the signup and
feed routes are unchanged by the seam. **Do not edit any spec to make it pass; if
it fails, report it.**

## Out of scope

`src/pages/LoginPage.tsx` (3b), `e2e/**` (3b and 7), the remaining cards (4, 5,
6), `src/lib/firstRun.ts` (done), `src/components/RadiusEmptyState.tsx` (2c is
closed), `plan.md`, `task-state.md`, `.scratch/**`, `.opencode/**`.

## Commit and report

Scoped `git add`. Only when green:

```
V28 slice 3a: the first card renders, and the first run renders bare
```

Do not push. Report:

```
Status: DONE | BLOCKED
Files changed:
  - <path> <what and why>
The isFirstRun constant: <where it is and both its uses>
The grid/padding fix: <the condition you now use, and the class <main> renders at md+ on /onboarding>
Commands run: <real tails; lint count vs the 80-warning baseline; test counts vs 65 files / 1975 tests>
Continuity: <what the name card does identically to the old branch, and what it loses or gains>
Stale claim at OnboardingPage:40-41: <what it says now>
Every other route's chrome unchanged: <how you know>
Gate green: yes | no
Commit: <sha>
Risks: <or "none">
Unresolved questions: <or "none">
```
