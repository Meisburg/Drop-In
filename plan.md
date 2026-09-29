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
| 10 | Notifications | V25's prompt keeps owning it. The first run must not fight it — mechanically: the shell suppresses `PushOptInPrompt` for `ONBOARDING_PATH` (see 16) |
| 11 | Kids card | Names + ages, as today (a kid's name is gated, and labels "who's coming") |
| 12 | The ending | Its own "places near you" finish card, not `/browse` |
| 13 | Scope | One batch, sliced; playtest once the cards exist |
| 14 | Seeding | The human plants real drop-ins by hand, in the app |
| 15 | Bio | **Drops out of the first run.** Stays on the existing `/settings` nudge and V27's parent-card editor |
| 16 | The interview's chrome | **The first run renders bare** — no header, no bottom nav, no push prompt, no resume nudge. **The route does NOT move out of `ProtectedShell`**; the shell suppresses its chrome for `ONBOARDING_PATH` |

**Why 16 is implemented as chrome suppression, not as a route move.** Moving
`/onboarding` outside `ProtectedShell` was the obvious reading, and it is the
wrong one. `ProtectedShell` is not chrome with a guard attached — it *is* the
guard, and its ordering is load-bearing and comment-documented: the `/mod` guard
and the post-edit fallback must both sit **before** the signed-out gate, and the
`I'm coming` return target may only apply on `gate === 'pass'`. Re-mounting that
logic elsewhere re-creates one long, carefully-ordered `if` ladder, and a
reordering bug there is worse than the nav it would remove. Suppressing the
chrome is a **local render change inside the guard that already runs**, so the
ordering is untouched and `e2e/onboarding-gate.e2e.ts` keeps testing the same
tree. The observable result is identical: the interview has no app chrome.

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
 *   (a) If every required card is answered, the run is finished → null.
 *   (b) Otherwise, the first card in `FIRST_RUN_CARDS` order that is
 *       unanswered and is either required, or optional with every required
 *       card before it already answered.
 * `account` counts as answered exactly when `signedIn`. Clause (a) is not
 * decoration: clause (b) alone NEVER returns null for a childless parent,
 * because a skipped `kids` is indistinguishable from a not-reached one — so
 * without (a) the run cannot end for anyone who skips an optional card.
 *
 * Consequences, both accepted and recorded:
 *  - It terminates, by clause (a). `area` is required and last, so a parent who
 *    sets a zip ends the run even having skipped kids and photo.
 *  - A *skipped* optional card IS re-offered while the run is unfinished
 *    (a required card is still unanswered), because "skipped" and "not
 *    reached" are indistinguishable from derived facts. That is up to two extra
 *    taps, on cards that still show Skip, and it is the price of not adding a
 *    step column. Do NOT add one.
 *
 * NOTE FOR REVIEWERS: the first draft of this plan stated clause (b) alone and
 * then claimed it terminates — self-contradictory prose. Slice 1's builder
 * implemented the terminating reading the acceptance criteria demanded and
 * flagged the discrepancy. This block is the corrected contract.
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

**There are THREE gate functions, all in `src/lib/onboarding.ts`. Miss one and
the app half-gates.** The shell does not call `resolveProtectedRedirect`; it
calls `resolveOnboardingGate`.

- `resolveProtectedRedirect(signedIn, homeZipSet, intendedPath)` **loses its
  onboarding bounce** — the `if (signedIn && needsOnboarding(...)) return
  ONBOARDING_PATH` branch goes. A no-zip parent renders every protected route.
- `resolveOnboardingGate(state)` **loses its `'onboard'` outcome** — that branch
  becomes `'pass'`. **Its `'loading'` and `'suspended'` outcomes are
  load-bearing and must not be touched:** `'loading'` is the cold-load race fix
  that `e2e/onboarding-gate.e2e.ts` pins (a signed-in parent cold-loading
  `/profile` must not bounce through `/onboarding` and lose the requested
  route), and `'suspended'` is the banned-profile screen.
- `resolveOnboardingRedirect(signedIn, homeZipSet)` **keeps its exact signature
  and loses nothing.** Its "already has a zip → `/`" behaviour is *already* the
  right behaviour: a profile row requires a `display_name` and a zip requires a
  profile row, so `finished ⟺ homeZipSet` in practice. **Do not re-key this
  function on `FirstRunFacts`** — it would add a dependency and change no
  behaviour, while forcing the builder to redesign a signature this plan does
  not authorize.
- `needsOnboarding(homeZipSet)` stays as the shared predicate for the **write**
  gates. It stops being a route gate.
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

### Batch invariant: `e2e/fixtures.ts` is a PER-SLICE obligation

`e2e/fixtures.ts` owns the two shared helpers that every viewer-based spec
depends on — **18 spec files call `signUpViewer` and 18 call `finishSignup`**:

- `signUpViewer` drives `input[autocomplete="given-name"]`,
  `[autocomplete="family-name"]` and `[autocomplete="street-address"]`.
  **All three fields die in this batch.** It must be rewritten in the slice that
  removes them, not at the end.
- `finishSignup` waits for the feed **or** the `Set your location` heading, and
  its own doc says those are the only two legitimate endings. **Every card this
  batch adds sits between signup and the location step**, so the helper must
  learn each new hop *in the same slice that adds it*.

**Therefore: every slice that changes the card sequence updates
`e2e/fixtures.ts` inside that same slice, and its verification includes the
specs it affects.** A slice that leaves the suite red is not done. This is the
V20 ticket 06 lesson repeating — fixing the signup write broke ~19 specs with
two-minute hangs because the helpers assumed a branch that had stopped
happening. The helpers are the blast radius here too.

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

### Slice 2a: The write sites ask for a location in place

- **Objective:** **every** write path that sets a going ping or creates a post
  requires a home ZIP at the point of action — so the requirement holds at the
  writes **before** the app-wide wall comes down.
- **Files in scope:** `src/pages/PlaydateDetailPage.tsx` (**three** write
  paths: `handlePingToggle` ~875, `handleSameTimeNextWeek` ~1068),
  `src/pages/NewPlaydatePage.tsx` (`handleSubmit`, ~1115),
  `src/pages/FeedPage.tsx` (`handleCardPingToggle`, ~786 — **the feed card's ping
  toggle, which 2c does NOT cover**), `src/components/LocationRequiredNotice.tsx`
  (new), `src/lib/homeZip.ts` (new) + `src/lib/homeZip.test.ts` (new)
- **⚠️ THERE ARE FOUR WRITE PATHS, NOT ONE — the first attempt at this slice
  guarded one of them and the reviewer caught the other two.** Verified by
  grepping the *write functions*, not the handler names:
  `togglePing(` has three call sites — `PlaydateDetailPage.tsx:906` (guarded),
  `:1068` (unguarded), `FeedPage.tsx:786` (unguarded) — and `createPlaydate(`
  has one, `NewPlaydatePage.tsx:1177` (guarded).
  **The lesson is a checkable instruction: a guard is only as complete as your
  grep for the CALL SITES of the thing being guarded.** Grepping for a handler
  name finds one path by construction. Re-grep `togglePing(|createPlaydate(`
  before claiming this slice is done.
- **⚠️ "HAS A HOME ZIP" MUST BE DEFINED ONCE.** The first attempt used
  `profile?.home_zip == null`, which treats the empty string as *set*; the gate's
  own derivation (`db.ts:266`) is `home_zip != null && home_zip !== ''`, which
  treats it as *unset*. So the guards were **looser than the wall they replace**.
  Fix by defining the predicate once — `hasHomeZip(zip: string | null |
  undefined): boolean` in `src/lib/homeZip.ts`, a pure function with a sibling
  test per the build law — and using it **at every site that tests a home zip
  for presence**, including the display-only map-pin checks
  (`FeedPage.tsx:399`, `NewPlaydatePage.tsx:911`, `BrowsePage.tsx:324`) and the
  gate derivation itself (`db.ts:266`). One predicate, one test, no class of
  drift.
- **Why this is FIRST and not last — the ordering is the whole point.** Removing
  the gate's bounce *before* the write sites guard would mean the location
  requirement is **removed, not moved**: a no-zip parent could ping or host with
  no location. Guards first, while the wall still stands (harmless there — the
  prompt is simply unreachable until 2b), *then* the wall comes down. **The
  requirement must never be absent at any slice boundary.**
- **Approach:** build the notice component first — a short "we need a place to
  show you nearby drop-ins" line whose action is the area card at `/onboarding`
  — then wire it at both actions. Each checks `profile?.home_zip`; unset means
  the action does not proceed and the notice appears. `NewPlaydatePage.tsx:905`
  and `FeedPage.tsx:399` already handle an unset `home_zip` defensively for the
  map pin — follow that pattern, do not invent one.
- **Acceptance criteria:**
  - With `home_zip` unset, **no** write path sets a ping or creates a post, and
    each shows the notice; with a zip set, behaviour is unchanged.
  - **The check that would have caught the miss:** `rg -n 'togglePing\(|createPlaydate\(' src/pages/` returns four call sites, and **every one sits
    inside a `hasHomeZip` guard**. State this in the report as a grep result, not
    as a belief.
  - `src/lib/homeZip.ts`'s `hasHomeZip` is the only place the predicate is
    written; `rg -n "home_zip == null|home_zip != null|home_zip !== ''" src/`
    returns no hits outside that module and its test.
  - The notice's action reaches `/onboarding`, and it is a real control with a
    ≥44px tap target and a focus cue — not a bare string.
  - `useSessionContext()`'s surface is unchanged.
- **Verification command:** `npm run verify` and
  `npx playwright test e2e/golden-path.e2e.ts`
- **Budget:** one local builder context. All six Slice-2 files total **6,243
  lines** — do not read them whole; this brief names the functions, so read
  around them. If both sites will not land cleanly, **land the ping site, stop,
  and report which site is unfinished** rather than half-wiring both.
- **Depends on:** Slice 1

### Slice 2b: The gate stops bouncing

- **Objective:** a signed-in parent with no home ZIP reaches every route,
  because the writes now carry the requirement (2a).
- **Files in scope:** `src/lib/onboarding.ts`, `src/lib/onboarding.test.ts`,
  `src/App.tsx`
- **Approach:** delete the bounce from `resolveProtectedRedirect`; drop the
  `'onboard'` outcome from `resolveOnboardingGate`. **Do not touch `'loading'` or
  `'suspended'`** — `'loading'` is the cold-load race fix that
  `e2e/onboarding-gate.e2e.ts` pins. Leave `resolveOnboardingRedirect`'s
  signature and body alone; its "already has a zip → `/`" behaviour is already
  the right behaviour, because a profile row requires a `display_name` and a zip
  requires a profile row, so `finished ⟺ homeZipSet`.
- **Acceptance criteria:**
  - `resolveProtectedRedirect(true, false, '/inbox')` returns `'/inbox'` — a
    no-zip parent is not redirected.
  - `resolveOnboardingGate` never returns `'onboard'`: `'pass'` for a settled
    signed-in parent, `'loading'` while a load is in flight, `'suspended'` for a
    banned profile.
  - `resolveOnboardingRedirect` is unchanged — `(true, false)` → `null`,
    `(true, true)` → `'/'`, `(false, true)` → `LOGIN_PATH`.
  - **The `I'm coming` return target still fires for a no-zip parent.** Today
    `'pass'` implies a zip, so this held by construction; removing `'onboard'`
    makes it a real decision. Pin it with a test — it means a new signup who
    tapped "I'm coming" is routed out of the interview to that playdate.
    Deliberate (see Risks), not silent.
  - No route redirects a signed-in parent away from the app.
  - **NO STALE CLAIM OF THE DELETED RULE SURVIVES IN A FILE THIS SLICE TOUCHES.**
    Removing the bounce makes every sentence that justified it false. The
    reviewer found three blocking examples inside the slice's own three files,
    and they are the general shape: the *primary docblock* of the function that
    changed (`App.tsx` ~50), the *file header* of the test file
    (`onboarding.test.ts` ~16), and the *rationale comment* on the cold-load
    race test (`onboarding.test.ts` ~95) which now passes for a different reason
    (`profileLoading`, not a stale zip). Grep the slice's own files for
    `home zip`, `/onboarding` and `onboard` before claiming done.
  - **No dead parameter or field in the gate.** `resolveProtectedRedirect`'s
    `homeZipSet` and `OnboardingGateState.homeZipSet` are both unread once the
    bounce goes. The project sets `noUnusedParameters: true`
    (`tsconfig.app.json:21`) — its own law is that an unused parameter is an
    error. **Remove both** and update the callers (`shellRedirect` at
    `App.tsx:336`, the gate call at `App.tsx:88`, and the tests) rather than
    silencing the compiler with a `_` prefix. A signature that advertises a
    dependency it does not have is exactly the defect the three review lanes
    exist to catch.
- **Verification command:** `npm run verify` and
  `npx playwright test e2e/onboarding-gate.e2e.ts`
- **Budget:** one local builder context. Small — this is the pure part, and the
  risk is a careless edit to `'loading'`, not size.
- **Depends on:** Slice 2a

### Slice 2c: The no-zip feed state

- **Objective:** a no-zip parent's feed is honest — stated, with a way out —
  rather than empty, broken, or silently radius-zero.
- **Files in scope:** `src/components/RadiusEmptyState.tsx`,
  `src/pages/FeedPage.tsx`, and `src/lib/feed.ts` (**comment only** — its
  `RadiusViewer` doc at ~line 49 still says "the onboarding gate keeps that state
  out of the feed"). The feed card's ping toggle is **already guarded by 2a**;
  this slice is the no-zip *state* only. The slice that owns a file owns its
  stale claims: fix `FeedPage.tsx:491` ("The shell's onboarding gate keys on
  home_zip" — it no longer does) and `RadiusEmptyState.tsx:79-86`, whose
  belt-and-braces comment says "the shell's onboarding gate keeps that state off
  these pages" — **2b is what made it reachable, so it is a flow now, not
  belt-and-braces.**
- **⚠️ THE MEASURED BEHAVIOUR (this corrects the plan's own first draft).**
  `db.ts:582` — `if (viewer.homeZip === null) return []`. So a no-zip parent's
  feed query returns an **empty list**, `posts.length === 0` fires, and
  **`RadiusEmptyState` renders today** with copy derived from the radius, every
  escape button **disabled** (`escapesDisabled`) and the post CTA suppressed. A
  lie ("Nothing within N miles yet.") whose only controls are inert — precisely
  the "second dead end wearing a control's clothes" this component's own doc
  exists to prevent. **2b is what made it reachable; before 2b the wall kept a
  no-zip parent off the feed entirely.**
- **⚠️ THE BRANCH GOES *INSIDE* `RadiusEmptyState`, NOT BEFORE IT.** The plan
  first said "branch before it" when it believed there was one caller. There are
  **two**: `FeedPage.tsx:1269` and `PlaceDirectory.tsx:1117` (Browse, via
  `radiusReason` — which fires for a no-zip parent precisely because every place
  has a null distance). Branching in `FeedPage` alone would fix one surface and
  leave **Browse's identical dead end** standing. `RadiusEmptyState`'s doc
already claims to be "ONE implementation for the feed ("Near you") and Browse" —
  and the component already reads `profile.home_zip` for `escapesDisabled`, so
  the no-zip case is already its business. **One early return fixes both callers
  and no future caller can miss it.**
- **Approach:** when `!hasHomeZip(profile?.home_zip)`, `RadiusEmptyState`
  early-returns **`<LocationRequiredNotice />`** — the component 2a already built
  for exactly this message (presentational, one definition, a real `/onboarding`
  link, 44px floor, focus cue). **Reuse it; do not write new copy and do not
  invent a second notice.** With a zip present, render exactly what it renders
  today.
- **Acceptance criteria:**
  - A no-zip parent opening the feed sees a stated "we need a home location"
    message with a real path to set one — **not** the radius empty state, not an
    error, and **not a disabled control**.
  - **The same is true on Browse**, by construction rather than by a second
    branch — and the slice must verify that, not assume it: name how you checked
    `PlaceDirectory`'s path.
  - A parent WITH a zip sees today's feed and today's radius empty state
    **byte-identical**, including the escape buttons and their busy/error states.
  - The `LocationRequiredNotice` data-testid is what renders in the no-zip case,
    and `empty-radius-state` is **not** rendered then.
  - No location-required *wall*: the state stays readable and ignorable
    (decision 3), never a modal, never a redirect. The feed itself is still
    reachable and the header/nav still work.
  - `feed.ts`'s change is comment-only — no behaviour line moves.
- **Verification command:** `npm run verify` and
  `npx playwright test e2e/zip-radius.e2e.ts`
- **Budget:** one local builder context.
- **Depends on:** Slice 2b

### Slice 3a: The card shell and the name card

- **Objective:** the card chrome exists, and `/onboarding`'s existing
  "what's your name" branch renders in it.
- **Files in scope:** `src/components/FirstRunCard.tsx` (new),
  `src/pages/OnboardingPage.tsx`, `src/App.tsx` (the bare-render seam only).
  Also fix `OnboardingPage.tsx`'s stale claim (~line 40) that a no-zip parent is
  *gated* to this page — nobody is gated to it any more; it is voluntary
  (ADR 0001). The slice that owns a file owns its stale claims.
- **Approach:** build the presentational chrome first (progress, title, body,
  children slot, primary action, optional Skip, back). On `/onboarding`, replace
  the existing "no profiles row → What's your name?" branch (`OnboardingPage.tsx`
  ~line 312) with the same card, labelled `2 of 5`. That branch **already exists**
  for social sign-in — generalize it, do not rewrite it. **Keep a
  `Continue`-matching primary label**: `finishSignup` and several specs locate
  it by `/^Continue/`.
- **The bare-render seam (decision 16).** `ProtectedShell` already computes
  `pathname === ONBOARDING_PATH` once, for its redirect branch (`App.tsx:~200`).
  Reuse **that** as one `isFirstRun` constant and use it to suppress, for that
  route only: the `<header>`, the `<nav>` bottom bar / rail, the `PushOptInPrompt`
  mounted in `<main>` (this is decision 10's mechanism — do not add a second
  flag for it), and the first-run resume nudge from Slice 3b. Keep `<main>` and
  the grid wrapper; the card owns the page's own padding. **Do not reorder or
  restructure any guard above this point** — the seam is a render decision, not a
  routing one.
- **Acceptance criteria:**
  - The name card creates the profile row exactly as today
    (`createProfile(composeDisplayName(...))`), including the
    `HandleTakenError` message on a taken name.
  - The name card is labelled `2 of 5`.
  - The chrome carries no domain logic — no zip/handle/kid rules inside
    `FirstRunCard.tsx`.
  - `/onboarding` renders with **no header, no bottom nav and no push prompt**,
    and every other route's chrome is byte-identical to before (decision 16).
  - Tap targets are ≥44px, inputs ≥16px, errors use `role="alert"` with the
    shared `fieldA11y`/`errorId` seams.
- **Verification command:** `npm run verify`
- **Budget:** one local builder context.
- **Depends on:** Slice 1

### Slice 3b: The account card, the trimmed signup, and the resume nudge

- **Objective:** a new parent creates an account with email + password and lands
  on the name card — and the shared spec helpers move with them.
- **Files in scope:** `src/pages/LoginPage.tsx`, `src/App.tsx` (the resume nudge
  lands in `ProtectedShell`, which is defined in `src/App.tsx` — **there is no
  `AppShell.tsx`**), `src/pages/OnboardingPage.tsx`, **`e2e/fixtures.ts`**
- **Approach:** trim `/login`'s signup to email + password, label it `1 of 5`,
  and navigate to `/onboarding` on success. Add the shell's dismissible
  "finish setting up" nudge. Rewrite `signUpViewer` to drop the three now-absent
  fields and walk to the name card; teach `finishSignup` the name hop.
- **Acceptance criteria:**
  - Signup collects email + password only; the given-name, family-name and
    street-address fields are gone from `/login`.
  - Signup success lands on `/onboarding`, not `/`.
  - Signup is labelled `1 of 5`; the name card is `2 of 5`.
  - `/login` no longer imports `composeDisplayName`.
  - `signUpViewer` no longer touches any removed selector, and `finishSignup`
    reaches the feed from the new sequence.
  - The shell's "finish setting up" line **never renders at the same time as
    `PushOptInPrompt`** — and by decision 16 it renders on `/onboarding` not at
    all, since the first run never shows either.
- **Verification command:** `npm run verify`, then
  `npx playwright test e2e/golden-path.e2e.ts e2e/onboarding-gate.e2e.ts`
- **Budget:** one local builder context.
- **Depends on:** Slices 2b, 3a

### Slice 4: The kids card and the photo card

- **Objective:** cards 3 and 4 collect kids (first name + age) and a photo, each
  with a working Skip.
- **Files in scope:** `src/pages/OnboardingPage.tsx`,
  `src/components/useCropStep.tsx` (reused, not rebuilt — **note the `.tsx`
extension; there is no `useCropStep.ts`**), **`e2e/fixtures.ts`**
- **Approach:** lift the existing kid-rows and avatar-upload logic into the card
  chrome. The crop step is **reused as-is** — it already validates size and type
  before decoding. Skipping advances without writing. **Note this is a
  reorder, not a verbatim lift:** the existing page runs photo (`~line 470`)
  before kids (`~line 532`); the chosen card order is kids then photo.
- **Acceptance criteria:**
  - The kids card accepts multiple kids (first name + age), enforces
    `MAX_KIDS_PER_PROFILE`, and reuses the existing `validateKid` rules
    including the blank-row skip.
  - Skip advances past each card without writing anything.
  - The photo card reuses `useCropStep` and `uploadAvatar`; a rejected file
    shows the existing error and does not trap the card.
  - A failure writing kids or photo is surfaced and does not block Continue.
  - Cards read `3 of 5` and `4 of 5`.
  - `finishSignup` walks the new kids and photo hops.
- **Verification command:** `npm run verify` and
  `npx playwright test e2e/avatar.e2e.ts`
- **Budget:** one local builder context.
- **Depends on:** Slice 3b

### Slice 5: The area card

- **Objective:** card 5 collects a location by address first, ZIP as fallback,
  plus a radius.
- **Files in scope:** `src/pages/OnboardingPage.tsx`, `src/lib/geocode.ts`
  (reused), `src/lib/feed.ts` (reused), `src/lib/onboarding.ts` +
  `src/lib/onboarding.test.ts` (retiring the fallback flag),
  `e2e/signup-zip-fallback.e2e.ts`, **`e2e/fixtures.ts`**
- **Approach:** move the address field and its `zipFromAddressQuery` geocode out
  of `/login` and into this card. An address that does not resolve reveals the
  ZIP field with the existing unresolved-address notice. Radius keeps
  `RADIUS_MILES_OPTIONS` and `DEFAULT_RADIUS_MILES`.
  **This slice retires the signup-ZIP-fallback mechanism.**
  `SIGNUP_ZIP_FALLBACK_KEY`, `markSignupZipUnresolved` and
  `consumeSignupZipUnresolved` exist for exactly one purpose: carrying "your
  signup address didn't resolve" across the `/login` → `/onboarding` route
  change. **The address and its failure now live on the same card, so the
  crossing is gone.** Remove all three symbols and their tests, and repurpose
  `e2e/signup-zip-fallback.e2e.ts` to assert the in-card notice — *update, never
  delete*.
- **Acceptance criteria:**
  - The three fallback symbols are gone, and nothing references
    `dropin.signup.zip-unresolved`.
  - Entering a resolvable address sets `home_zip` without the parent typing a
    ZIP.
  - An unresolvable address reveals the ZIP field and the existing notice; it
    never blocks and never loses the typed address.
  - The radius picker offers exactly `RADIUS_MILES_OPTIONS` and defaults to
    `DEFAULT_RADIUS_MILES`.
  - `validateHomeZip` gates the ZIP against the seeded gazetteer, inline.
  - The card reads `5 of 5`, and finishing it lands on the finish card.
- **Verification command:** `npm run verify` and
  `npx playwright test e2e/address-maps.e2e.ts e2e/zip-radius.e2e.ts e2e/signup-zip-fallback.e2e.ts`
- **Budget:** one local builder context.
- **Depends on:** Slice 3b

### Slice 6: The finish card — places near you

- **Objective:** the flow ends on up to three real nearby places, not an empty
  feed.
- **Files in scope:** `src/pages/OnboardingPage.tsx`, `src/lib/places.ts`
  (reused read path), the finish card's presentational component,
  **`e2e/fixtures.ts`**
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
  - `finishSignup` passes through the finish card to reach the feed.
- **Verification command:** `npm run verify`
- **Budget:** one local builder context.
- **Depends on:** Slices 1, 5

### Slice 7: The lane cleanup — specs, docs, and the last no-zip gaps

- **Objective:** every remaining lane that pinned the old behaviour is updated,
  **and the batch's remaining no-zip honesty gaps on Browse are closed**, so
  nothing is left asserting or showing a flow that no longer exists.
- **Files in scope:** the specs that assert signup's fields or the ZIP redirect
  beyond what `e2e/fixtures.ts` already covers, `docs/`, `task-state.md`,
  `.scratch/v28/ledger.md`, **`src/lib/places.ts` / `src/components/PlaceDirectory.tsx`**
  (the unplaced-section item below), and the stale-claim files listed under
  acceptance.
- **Approach:** grep `e2e/` for specs that assert the old field list or the
  bounce, and update them to the new contract — **update, never delete**. The
  bulk of this work belongs to the slices that caused it (see the batch
  invariant); this slice catches only what those missed.
- **Acceptance criteria:**
  - No spec asserts that signup collects a name or an address.
  - No spec asserts that a no-zip parent is redirected to `/onboarding`.
  - **Every stale claim left by the deleted gate is gone.** Slice 2b's reviewer
    swept `src/` and `e2e/` and found these still asserting a rule that no
    longer exists; the slices that own the file fix their own, and this slice
    catches the rest — `src/lib/db.ts:131,142,267,575-576`,
    `src/pages/ProfilePage.tsx:215`, `e2e/auth.setup.ts:7,67`,
    `e2e/fixtures.ts:237,385`. (The `db.ts` one — `listRadiusFeed`'s doc saying
    "the onboarding gate keeps that state out of the routes" — sits at **575-576**;
    line 577 is `*/` and 578 the signature. Slice 2c's builder cited 577-578 and
    the orchestrator copied that into this plan without counting, **regressing a
    reference that had been right at 575** — the reviewer caught it. Its first
    half, "a viewer with no home zip gets an empty feed", stays true. The
    `return []` on line 582 does **not** move.)
    (`OnboardingPage.tsx` and `FeedPage.tsx` belong to
    3a and 2c; do not re-open them.)
  - **The stale-claim test is a grep — and it must be a MULTI-LINE-aware one.**
    The claim above spans two source lines (`… (the onboarding` / `* gate keeps
    that state out of the routes …`), so a single-line grep for the sentence
    **misses it** — as this slice's own planning just did. Grep short fragments
    (`onboarding gate`, `keys on home_zip`, `bounces? to /onboarding`) and read
    the hits. No file under `src/` or `e2e/` may still say the gate keys on the
    home zip, or that a no-zip parent is bounced to `/onboarding`.
  - **THE SECOND NO-ZIP LIE ON BROWSE IS CLOSED.** Slice 2c's reviewer found a
    real one below the notice: `src/lib/places.ts:2284`,
    `const unplaced = listRows.filter((row) => row.distanceMiles === null)`. For a
    no-zip viewer **every** row's distance is null (`placeDistanceMiles` returns
    null when the viewer has no zip), so the whole directory lands in the
    "Not on the map yet" section — **misattributing the viewer's missing location
    to the places.** It also sits directly under the location notice, saying two
    different things at once. Decide and implement: either do not render that
    section for a no-zip viewer (the notice already explains the state), or
    re-word it so it blames the missing location rather than the places. **State
    which you chose and why.** `placeDistanceMiles`'s null must not change — the
    distance really is unknown.
  - **`e2e/onboarding-gate.e2e.ts`'s docblock stops overstating what it pins.**
    Its fixture gets `home_zip=98107` (`e2e/auth.setup.ts`), so it can never
    catch a reintroduced home-zip bounce — it pins the cold-load behaviour only.
    Say that, and keep the assertion.
  - **`e2e/places-map-view.e2e.ts`'s "`00000` not NULL" rationale is rewritten.**
    It justifies the choice by a null-zip bounce that no longer exists. The spec
    still passes; the reason it gives is false.
  - **A no-zip parent is pinned at the browser level.** Slice 2b's reviewer
    flagged that *nothing* outside the unit tests pins "a no-zip parent reaches
    every route" — the property has no e2e catch at all, and the fixtures that
    could express it arrive in 3b. Add one. **It must also assert Slice 2c's
    branch**, because 2c cannot test it otherwise: the repo unit-tests only
    `.ts` (there are **zero `.tsx` test files** in 60 test files), so a
    component-level branch has no unit lane. The e2e must check that a no-zip
    parent's feed renders `location-required-notice` and **not**
    `empty-radius-state`. If it cannot be built, say why in the report rather
    than leaving the gap unnamed.
  - The **full** e2e suite is green (not just targeted specs) — this is the one
    slice whose verification is the whole lane, because the card sequence is
    what changed.
  - `npm run verify` green, including `a11y:focus`, `steering-lint` and GUARDS.
  - The batch's decisions are recorded in `task-state.md` and the ledger.
- **Verification command:** `npm run verify` and `npx playwright test`
- **Budget:** one local builder context, plus one full e2e run (~8–10 min under
  `nice -n 19`).
- **Depends on:** Slices 3b–6

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

- **The playtest lane cannot reach this flow, so decision 13's checkpoint rests
  entirely on the human.** `/onboarding` is not in `.scratch/playtest/routes.json`
  and cannot be: a signed-out visitor to it is redirected to `/login`, so the
  routes sweep can never see the cards. Leave `routes.json` alone — but be clear
  that **Slice 8's human playtest is the only lane that verifies the flow**, and
  decision 13 is weaker than it looks.
- **Open (not yet decided): does the interview belong inside `ProtectedShell`?**
  `/onboarding` is mounted inside `ProtectedShell`, so cards 2–5 render with the
  app's bottom navigation and header. For an interview that is chrome leaking in
  early — and now that a no-zip parent can browse (decision 3), the nav actively
  competes with the cards. Moving `/onboarding` outside the shell's chrome (keeping
  only the auth guard) is the cleaner shape, at the cost of re-implementing the
  gate. **Recommendation: worth doing, but it is a design call for the human, not
  a builder.**
- **The ending depends on content that does not exist yet.** Slice 6 is
  verifiable with a fixture, but the *payoff* is only real after Slice 8. Do not
  let a green Slice 6 read as "the cold start is solved."
- **Slice 2 was split into 2a/2b/2c on measurement, not taste.** As first
  written it handed one builder context six files totalling **6,243 lines**
  (`PlaydateDetailPage.tsx` alone is 2,803) and hedged with "if the two write
  sites cannot be done cleanly in one, split…" — a hedge is not a decision. The
  split also fixes an ordering hole: **the write-site guards must land before the
  wall comes down**, or the location requirement is removed rather than moved.
  So 2a (write sites) → 2b (the gate) → 2c (the feed state). **A builder that
  cannot land the feed, the detail page and the host page is no longer asked to
  guess: the slices are sized so it never has to.** If a half-moved gate ever
  appears anyway, the test is precise — any code path that still returns
  `'onboard'` or `ONBOARDING_PATH` as a *route* redirect, or any write path that
  proceeds with `home_zip` unset.
- **Derived resume re-offers skipped optional cards.** Accepted in decision 6's
  implementation; recorded in Interfaces. **The plan previously understated the
  cost as "one extra tap": a parent who abandoned on card 5 (area) after
  skipping kids and photo is returned to card 3 and must skip twice to get back
  — up to two extra taps and two extra screens.** Reversing it means adding a
  step column, which is explicitly out of scope.
- **Signup losing its name field changes `/login`'s error surface.** The
  `HandleTakenError` path moves to card 2; make sure `/login` no longer imports
  `composeDisplayName` for a field it no longer has.
- **A no-zip parent can now hold an account indefinitely.** Discovery surfaces
  must treat a missing home zip as normal, never an error (ADR 0001).
- **A NEW interaction Slice 2 creates: the `I'm coming` return target can now
  fire mid-interview.** `ProtectedShell` applies the stored
  `PLAYDATE_RETURN_KEY` target only on `gate === 'pass'` (`App.tsx:~195`), and
  today `'pass'` requires a home zip — so the return lands *after* onboarding by
  construction. **Slice 2 removes `'onboard'`, so `'pass'` becomes true for a
  no-zip parent**, and a brand-new signup who tapped "I'm coming" on a public
  page can be redirected out of the interview to that playdate's detail page —
  skipping cards 3–5. **Ruling: this is acceptable and even desirable** (it
  honours an explicit tap, and the resume nudge covers the rest), but it is an
  unintended consequence that must be **recorded, not discovered**. Slice 2's
  acceptance includes one test pinning that the return target still fires for a
  no-zip parent, so the behaviour is chosen rather than accidental.
- **The plan's own NOTE about `firstRun.ts`'s doc comment is now closed:** fix
  round 1 restated the corrected two-clause rule in the module itself.
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
- 2026-09-29 — **High-effort review against the real code. Six defects found,
  two serious. All corrected in place.**
  1. **`e2e/fixtures.ts` was in no slice's scope.** `signUpViewer` drives
     given-name/family-name/street-address — all three of which this batch
     deletes — and `finishSignup` asserts the feed-or-location binary, which
     every new card breaks. **18 spec files call each helper.** Added as a
     batch-level invariant: the helpers are updated *inside the slice that
     changes the sequence*, not cleaned up at the end.
  2. **The plan named two of the three gate functions.** The shell calls
     `resolveOnboardingGate`, whose `'loading'` branch is the cold-load race fix
     pinned by `e2e/onboarding-gate.e2e.ts`. A builder following the old text
     would have missed the function that actually gates.
  3. **`resolveOnboardingRedirect`'s pinned acceptance criterion was
     unimplementable** — it invented a `finished` parameter the function does
     not have. Verified the re-keying is a **near no-op** (a profile row
     requires a `display_name`, so `finished ⟺ homeZipSet`), and pinned the
     signature as unchanged.
  4. **Decision 10 had no carrying slice.** `PushOptInPrompt` renders on
     `/login` *and* in the shell, and Slice 3 adds a second shell banner — the
     collision decision 10 forbids was unaddressed. Added a mutual-exclusion
     acceptance criterion.
  5. **The signup-ZIP-fallback mechanism becomes dead code.**
     `SIGNUP_ZIP_FALLBACK_KEY`, `markSignupZipUnresolved`,
     `consumeSignupZipUnresolved` exist only to carry a failure across the
     `/login` → `/onboarding` route change, which the area card eliminates. It
     was named nowhere; Slice 5 now retires it.
  6. **Slice 3 was too big for one context** (new component + login rewrite +
     name branch + shell nudge), against the template's own rule. Split into 3a
     (shell + name card) and 3b (signup + nudge + helpers). Also corrected: the
     kids/photo cards are a **reorder** of the existing page, not a verbatim
     lift; and the resume cost is up to two extra taps, not one.
  Left open for the human: **whether the interview belongs inside
  `ProtectedShell`'s chrome** — cards 2–5 currently render with the bottom nav,
  which competes with the cards and leaks the finished app early.
