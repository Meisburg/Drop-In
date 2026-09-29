# Implementation Plan: V28 — The First Run (card-by-card onboarding)

> Owned by the orchestrator. Written BEFORE any builder dispatch. Every slice
> below must be executable without interpretation.
>
> Supersedes the V27 plan, preserved byte-identically at `plan-v27-backup.md`
> (`diff -q` clean).
>
> Default slice gate: **`npm run verify`** (build + test + lint + guards).
> Anything extra is pinned in the slice.

## Goal

A brand-new parent signs up and is **interviewed one card at a time** — five
cards, one question each, in a welcoming sequence — and lands on something real
near them instead of an empty feed. After this batch, `/onboarding` is no longer
a single long form, the home ZIP is no longer a wall, an abandoned first run is
resumable instead of dead, and the flow's last card shows real nearby places
rather than nothing.

**How we'll know it worked:** Nicole can sign up on her phone, unassisted, and
reach a screen showing real places near her — and she can quit halfway through,
come back, and land where she left off without losing her account or facing a
locked app.

### Why this shape (the grilled decisions — do not re-litigate in a builder)

| # | Decision | Ruling |
|---|---|---|
| 1 | What this is for | Launch prep: inviting a first cohort |
| 2 | Primary job | Learn about you, then land on something real near you |
| 3 | The location gate | Moves off the app and onto the **writes** (ADR 0001) |
| 4 | Signup shape | **Account first**, as card 1 of 5 |
| 5 | Card sequence | account → name → kids → photo → area → finish |
| 6 | Abandonment | Resume at the card they left. Never a wall, never a restart |
| 7 | Cold start | Real places nearby **+** real drop-ins seeded by hand before invites |
| 8 | Required cards | **Name + area required**; kids + photo skippable. Account is not skippable |
| 9 | The address | The **area card** asks the address, ZIP as fallback |
| 10 | Notifications | V25's prompt keeps owning it. The first run must not fight it |
| 11 | Kids card | Names + ages, as today (a kid's name is gated, and labels "who's coming") |
| 12 | The ending | Its own "places near you" finish card, not `/browse` |
| 13 | Scope | One batch, sliced; playtest once the cards exist |
| 14 | Seeding | The human plants real drop-ins by hand, in the app |
| 15 | Bio | **Drops out of the first run.** Stays on the existing `/settings` nudge and V27's parent-card editor |

### Measured facts this plan rests on (evidence, not assumption)

- The platform has **2 human accounts** (`jonmeisburg@`, `nicolemeisburg@`). Of
  54 non-`e2e` profiles, the rest are `slice9-*` / `testaccount` fixtures. There
  is **no adoption or churn data** — this is a launch-prep bet, not a fix for a
  measured drop-off.
- **16 drop-ins exist; the latest is `2026-09-26`; zero are upcoming.** The feed
  is empty of future drop-ins, which is why decision 7 exists.
- Profile enrichment is thin: **7 of 54** have a bio, **10 of 54** a photo.
- `profiles` has **no auto-create trigger**. `createProfile(displayName)` is
  called explicitly from `/login`, and it requires a display name.

## Non-goals

- **Not** a change to `/browse`, the places directory, or place detail pages.
  The finish card *links into* them; it does not rebuild them.
- **Not** a notifications redesign. V25's `PushOptInPrompt` and its pure
  `decidePermissionPrompt` are untouched; the first run simply does not compete
  with them.
- **Not** a bio card, and not a rework of `/profile` (V27 owns that surface).
- **Not** a `profiles.bio` cleanup — that is V28 ticket
  `01-retire-profiles-bio.md`, a separate slice.
- **Not** new database tables or columns. Resume is derived (see Interfaces).
- **No new routes.** The flow lives on `/onboarding`, which already exists and is
  already mounted inside `ProtectedShell`.
- **Not** a social sign-in redesign. Google's path keeps working; it just enters
  the same card flow at the **name** card (which is where it already enters).

## Interfaces

The orchestrator pins these so builders do not re-decide them.

### `src/lib/firstRun.ts` (new — the pure model, with a sibling test)

```ts
/** The five cards of the first run, in order. */
export type FirstRunCardId = 'account' | 'name' | 'kids' | 'photo' | 'area'

export const FIRST_RUN_CARDS: readonly FirstRunCardId[]
// ['account', 'name', 'kids', 'photo', 'area']

/** What the profile already has. Read from the session; NEVER stored. */
export interface FirstRunFacts {
  signedIn: boolean
  hasName: boolean   // a profiles row exists with a display_name
  hasKids: boolean   // at least one kids row
  hasPhoto: boolean  // avatar_url is set
  hasZip: boolean    // home_zip is set
}

/** Which cards may be left unanswered. account/name/area = false. */
export function isSkippable(card: FirstRunCardId): boolean

/**
 * The card a returning parent should land on, or null when the run is done.
 *
 * THE RULE (pinned — it is the whole of resume):
 * the first card in `FIRST_RUN_CARDS` order that is unanswered AND is either
 * required, or optional with every required card before it already answered.
 *
 * Consequences, both accepted and recorded:
 *  - It terminates: `area` is required and last, so answering it ends the run.
 *  - A *skipped* optional card is re-offered while the run is unfinished,
 *    because "skipped" and "not reached" are indistinguishable from derived
 *    facts. That is one extra tap, on a card that still shows Skip, and it is
 *    the price of not adding a step column. Do NOT add one.
 */
export function nextUnfinishedCard(facts: FirstRunFacts): FirstRunCardId | null

/** "2 of 5" — 1-based position within FIRST_RUN_CARDS. */
export function progressLabel(card: FirstRunCardId): string
```

Purity is a requirement, not a preference: no `Date.now`, no client, no I/O, no
`window`. `firstRun.test.ts` must prove it, and every rule above must be
mutation-checked (flip the rule, watch a named test die).

### Copy seam

Card titles, bodies and button labels live as data in `firstRunCopy.ts`, not
inline in JSX, so the words are reviewable in one place and a test can pin the
required ones. The honest precedent is `src/lib/vibeChips.ts` — a small, tested
module of labels-as-data. **There is no `*Copy.ts` convention in this repo; do
not invent one.**

### Routing (pinned)

- **Card 1 (account) renders on `/login`**, in its existing `signup` mode,
  trimmed to **email + password only**. The name and address fields move out.
  `/login` stays outside `ProtectedShell`.
- **Cards 2–5 render on `/onboarding`**, which stays inside `ProtectedShell` at
  its existing path. **No new route, so `routes.json` is unchanged.**
- `/login`'s signup success now navigates to `/onboarding` (today it navigates
  to `/`).
- The progress indicator reads `2 of 5` … `5 of 5` on `/onboarding`; card 1
  carries `1 of 5` on `/login`.

### The gate (pinned)

- `resolveProtectedRedirect` **loses its onboarding bounce.** The ZIP no longer
  redirects anyone away from any route.
- `resolveOnboardingRedirect` keeps its signed-out → `/login` behaviour and
  **loses** its "already has a zip → `/`" behaviour, which becomes "already
  finished → `/`" (i.e. `nextUnfinishedCard(facts) === null`).
- The location requirement moves onto the **going-ping** and **host-a-drop-in**
  actions, which ask for it in place.

### The abandonment path (pinned)

An unfinished run is **never a wall**. The shell renders a dismissible "finish
setting up" line whose action is `nextUnfinishedCard(facts)`; the parent can
ignore it forever and still use the app.

### The finish card (pinned)

Its own card at the end of `/onboarding`: up to three real places near the
parent (places with hours preferred), each offering a path to host a drop-in
there. When there are no nearby places at all, it falls back to the flow's
honest empty state — never a blank screen and never a claim about drop-ins that
do not exist.

## Slices

### Slice 1: The pure first-run model

- **Objective:** `src/lib/firstRun.ts` exists, is provably pure, and pins cards,
  skip rules, the resume rule, and the progress label.
- **Files in scope:** `src/lib/firstRun.ts`, `src/lib/firstRun.test.ts`,
  `src/lib/firstRunCopy.ts`, `src/lib/firstRunCopy.test.ts`
- **Approach:** TDD. Write the failing tests from the Interfaces block above
  first. `nextUnfinishedCard` must be exercised across every fact combination
  that changes the answer, including the childless parent (never `hasKids`) and
  the skipped-photo parent.
- **Acceptance criteria:**
  - `FIRST_RUN_CARDS` is exactly `['account','name','kids','photo','area']` in
    that order.
  - `isSkippable` is false for `account`, `name`, `area`; true for `kids`,
    `photo`.
  - `nextUnfinishedCard({signedIn:false,…})` is `'account'`.
  - `nextUnfinishedCard` returns `'name'` when signed in with no name; `'kids'`
    when name is set and kids is not; `'photo'` when kids is set and photo is
    not; `'area'` when photo is set and zip is not; `null` only when name and
    zip are both set.
  - A parent who never sets `hasKids` still terminates: with name and zip set,
    the result is `null`.
  - `progressLabel('photo')` is `'4 of 5'`.
  - The module imports no client, reads no clock, and touches no browser global.
- **Verification command:** `npm run verify`
- **Budget:** one local builder context. Small.
- **Depends on:** nothing

### Slice 2: The gate moves off the app and onto the writes

- **Objective:** a signed-in parent with no home ZIP can see the feed; only
  pinging and hosting require a location.
- **Files in scope:** `src/lib/onboarding.ts`, `src/lib/onboarding.test.ts`,
  `src/pages/FeedPage.tsx`, `src/pages/PlaydateDetailPage.tsx`,
  `src/pages/NewPlaydatePage.tsx`, `src/components/RadiusEmptyState.tsx` (or the
  file that owns the empty-feed copy)
- **Approach:** delete the bounce from `resolveProtectedRedirect`; change
  `resolveOnboardingRedirect` to key on the finished run rather than the zip;
  add a location-required prompt at the two write sites. The no-zip feed state
  must be honest ("we don't know where you are yet") and offer the area card.
- **Acceptance criteria:**
  - `resolveProtectedRedirect(true, false, '/inbox')` returns `'/inbox'` — a
    no-zip parent is not redirected.
  - `resolveOnboardingRedirect(true, finished=false)` is `null`; with
    `finished=true` it is `'/'`; signed out it is `LOGIN_PATH`.
  - A no-zip parent opening the feed sees a stated "we don't know where you are
    yet" state with a path to set it — not an empty radius state and not an
    error.
  - Pinging and hosting surface the location requirement at the point of action.
  - No route redirects a signed-in parent away from the app.
- **Verification command:** `npm run verify` and
  `npx playwright test e2e/zip-radius.e2e.ts`
- **Budget:** one local builder context. If the two write sites cannot be done
  cleanly in one, split the feed state from the write gates.
- **Depends on:** Slice 1 (consumes `nextUnfinishedCard`)

### Slice 3: The card shell, the account card, and the name card

- **Objective:** a new parent creates an account with email + password and is
  asked their name on the next card — the same card chrome, in one flow.
- **Files in scope:** `src/components/FirstRunCard.tsx` (new),
  `src/pages/LoginPage.tsx`, `src/pages/OnboardingPage.tsx`, `src/App.tsx`
  (the resume nudge lands in `ProtectedShell`, which is defined in
  `src/App.tsx` — **there is no `AppShell.tsx`**)
- **Approach:** build the presentational card chrome first (progress, title,
  body, children slot, primary action, optional Skip, back). Trim `/login`'s
  signup form to email + password and label it `1 of 5`. On `/onboarding`,
  replace the existing "no profiles row → What's your name?" branch with the same
  card, labelled `2 of 5`. That branch **already exists** for social sign-in —
  generalize it, do not rewrite it. Add the shell's resume nudge.
- **Acceptance criteria:**
  - Signup collects email + password only; the first-name, last-name and address
    fields are gone from `/login`.
  - Signup success lands on `/onboarding`, not `/`.
  - The name card creates the profile row exactly as today
    (`createProfile(composeDisplayName(...))`), including the
    `HandleTakenError` message on a taken name.
  - The name card is labelled `2 of 5`; signup is labelled `1 of 5`.
  - The shell shows a dismissible "finish setting up" line for an unfinished
    run, and dismissing it does not hide it forever within the session.
  - Tap targets are ≥44px, inputs ≥16px, errors use `role="alert"` with the
    shared `fieldA11y`/`errorId` seams.
- **Verification command:** `npm run verify` and
  `npx playwright test e2e/golden-path.e2e.ts`
- **Budget:** one local builder context, possibly two (shell, then cards).
- **Depends on:** Slices 1–2

### Slice 4: The kids card and the photo card

- **Objective:** cards 3 and 4 collect kids (first name + age) and a photo, each
  with a working Skip.
- **Files in scope:** `src/pages/OnboardingPage.tsx`,
  `src/components/useCropStep.tsx` (reused, not rebuilt — **note the `.tsx`
extension; there is no `useCropStep.ts`**)
- **Approach:** lift the existing kid-rows and avatar-upload logic verbatim into
  the card chrome. The crop step is **reused as-is** — it already validates size
  and type before decoding. Skipping advances without writing.
- **Acceptance criteria:**
  - The kids card accepts multiple kids (first name + age), enforces
    `MAX_KIDS_PER_PROFILE`, and reuses the existing `validateKid` rules
    including the blank-row skip.
  - Skip advances past each card without writing anything.
  - The photo card reuses `useCropStep` and `uploadAvatar`; a rejected file
    shows the existing error and does not trap the card.
  - A failure writing kids or photo is surfaced and does not block Continue.
  - Cards read `3 of 5` and `4 of 5`.
- **Verification command:** `npm run verify` and
  `npx playwright test e2e/avatar.e2e.ts`
- **Budget:** one local builder context.
- **Depends on:** Slice 3

### Slice 5: The area card

- **Objective:** card 5 collects a location by address first, ZIP as fallback,
  plus a radius.
- **Files in scope:** `src/pages/OnboardingPage.tsx`, `src/lib/geocode.ts`
  (reused), `src/lib/feed.ts` (reused)
- **Approach:** move the address field and its `zipFromAddressQuery` geocode out
  of `/login` and into this card. An address that does not resolve reveals the
  ZIP field with the existing unresolved-address notice. Radius keeps
  `RADIUS_MILES_OPTIONS` and `DEFAULT_RADIUS_MILES`.
- **Acceptance criteria:**
  - Entering a resolvable address sets `home_zip` without the parent typing a
    ZIP.
  - An unresolvable address reveals the ZIP field and the existing notice; it
    never blocks and never loses the typed address.
  - The radius picker offers exactly `RADIUS_MILES_OPTIONS` and defaults to
    `DEFAULT_RADIUS_MILES`.
  - `validateHomeZip` gates the ZIP against the seeded gazetteer, inline.
  - The card reads `5 of 5`, and finishing it lands on the finish card.
- **Verification command:** `npm run verify` and
  `npx playwright test e2e/address-maps.e2e.ts e2e/zip-radius.e2e.ts`
- **Budget:** one local builder context.
- **Depends on:** Slice 3

### Slice 6: The finish card — places near you

- **Objective:** the flow ends on up to three real nearby places, not an empty
  feed.
- **Files in scope:** `src/pages/OnboardingPage.tsx`, `src/lib/places.ts`
  (reused read path), the finish card's presentational component
- **Approach:** reuse the places read the directory already uses — do not add a
  query shape. Prefer places with hours. Each place offers a path into hosting a
  drop-in there; the CTA must not be a dead end for a parent with no location.
- **Acceptance criteria:**
  - With places near the parent, the card shows at most three, each linking to a
    real place.
  - With no places near the parent, the card falls back to the flow's honest
    empty state and still offers a next step.
  - The card makes no claim about upcoming drop-ins — there are none.
  - Reaching this card ends the run: `nextUnfinishedCard` is `null` afterwards.
- **Verification command:** `npm run verify`
- **Budget:** one local builder context.
- **Depends on:** Slices 1, 5

### Slice 7: The lane cleanup — specs, playtest, docs

- **Objective:** every lane that pinned the old behaviour is updated in the same
  batch, so nothing is left asserting a flow that no longer exists.
- **Files in scope:** `e2e/onboarding-gate.e2e.ts` and
  `e2e/signup-zip-fallback.e2e.ts` (both pin behaviour this batch changes),
  `e2e/zip-radius.e2e.ts`, `e2e/golden-path.e2e.ts`, `e2e/avatar.e2e.ts`, plus
  any other spec that pins signup's fields or the ZIP redirect;
  `.scratch/playtest/routes.json` only if reachability changed; `docs/`,
  `task-state.md`
- **Approach:** find every spec that pins signup's name/address fields or the
  ZIP redirect and update it to the new contract — **update, never delete**. The
  `ocr` rules file expects new routes in the playtest list; `/onboarding` is not
  a new route, so leave `routes.json` alone unless reachability genuinely moved.
- **Acceptance criteria:**
  - No spec asserts that signup collects a name or an address.
  - No spec asserts that a no-zip parent is redirected to `/onboarding`.
  - `npm run verify` green, including `a11y:focus`, `steering-lint` and GUARDS.
  - The batch's decisions are recorded in `task-state.md` and the ledger.
- **Verification command:** `npm run verify`
- **Budget:** one local builder context.
- **Depends on:** Slices 2–6

### Slice 8 (human, not a builder): seed real drop-ins, then playtest

- **Objective:** the finish card has something true to show, and the flow is
  tested on a real person.
- **Owner:** the human (decision 14).
- **Steps:** the human creates a handful of real drop-ins in the first cohort's
  ZIPs, in the app, before anyone is invited. Then Nicole runs the flow
  unassisted on her phone, from signup to the finish card, including quitting
  halfway and returning.
- **Acceptance criteria:** Nicole completes the flow without help, and her
  abandoned run resumes where she left it.
- **Verification command:** none — this is the playtest lane
  (`docs/agents/playtest-lane.md`), and its verdict is the evidence.

## Risks / open questions

- **The ending depends on content that does not exist yet.** Slice 6 is
  verifiable with a fixture, but the *payoff* is only real after Slice 8. Do not
  let a green Slice 6 read as "the cold start is solved."
- **Slice 2 is cross-cutting.** Moving the gate touches the feed, the detail
  page and the host page. If a builder cannot land all three inside one context,
  it must stop and report rather than half-move the gate — a half-moved gate is
  worse than the wall.
- **Derived resume re-offers skipped optional cards.** Accepted in decision 6's
  implementation; recorded in Interfaces. Reversing it means adding a step
  column, which is explicitly out of scope.
- **Signup losing its name field changes `/login`'s error surface.** The
  `HandleTakenError` path moves to card 2; make sure `/login` no longer imports
  `composeDisplayName` for a field it no longer has.
- **A no-zip parent can now hold an account indefinitely.** Discovery surfaces
  must treat a missing home zip as normal, never an error (ADR 0001).
- **`ALLOW_CONFIG_CHANGE` may be needed** if a slice touches check config; state
  the reason in the command when it is.

## Status log (orchestrator appends after every phase transition)

- 2026-09-29 — Grilled to an empty frontier. 15 decisions settled, `CONTEXT.md`
  and `docs/adr/0001-home-zip-stops-being-a-gate.md` written. Facts measured
  against the live DB (2 human accounts, 0 upcoming drop-ins, 7/54 bios). Plan
  written; **no slice dispatched yet.**
- 2026-09-29 — Plan audited against the tree before dispatch. **Five defects
  corrected in place:** `src/components/AppShell.tsx` (the shell is
  `ProtectedShell`, in `src/App.tsx`); `useCropStep.ts` → `useCropStep.tsx`; the
  **invented** `src/lib/*Copy.ts` precedent → the real `src/lib/vibeChips.ts`;
  and `e2e/onboarding-gate.e2e.ts` + `e2e/signup-zip-fallback.e2e.ts` added to
  Slice 7 — both pin behaviour this batch changes and neither had been named.
  **Verified accurate:** `npm run verify`'s exact composition
  (`build && test && lint && a11y:focus && steering-lint && guards`),
  `firstRun.ts` genuinely absent, `zip-radius`/`address-maps`/`avatar`/
  `golden-path` e2e specs all real, and every named symbol resolving in `src/`
  (`resolveProtectedRedirect`, `resolveOnboardingRedirect`,
  `RADIUS_MILES_OPTIONS`, `DEFAULT_RADIUS_MILES`, `MAX_KIDS_PER_PROFILE`,
  `validateKid`, `uploadAvatar`, `fieldA11y`, `composeDisplayName`,
  `zipFromAddressQuery`, `validateHomeZip`, `HandleTakenError`).
  **Lesson, recorded:** the plan's factual claims were recollection, not
  measurement. A doc that says "no interpretation required" must be grepped
  into existence, not remembered. Next: dispatch Slice 1.
