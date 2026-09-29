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
- `resolveOnboardingRedirect(signedIn, homeZipSet)` **keeps its signature in
  Slice 2** — this slice does not re-key it, and its `(true, false) → null`
  behaviour is load-bearing for `e2e/onboarding-gate.e2e.ts` right up until the
  ending exists. **⚠️ BUT ITS `(true, true) → HOME_PATH` BRANCH BECOMES WRONG THE
  MOMENT THE FINISH CARD EXISTS, and Slice 6 is the slice that removes it.** The
  claim this bullet used to make — "a profile row requires a `display_name` and a
  zip requires a profile row, so `finished ⟺ homeZipSet` in practice, so do not
  re-key it" — is **FALSE under decision 5's order**: `finished` means every
  *required* card is answered, and the area card is **card 5 of 5**, so writing
  the zip sets `homeZipSet` true **while the run is still going**, and
  `OnboardingPage.tsx:174-175`'s `<Navigate>` fires before the next card can
  render. **Nothing in Slices 1–3 is affected** (a parent cannot hold a zip
  without a name, so the guard's done-set and `nextUnfinishedCard`'s still
  agree); the defect lands on Slice 5's final landing and on Slice 6's whole
  reason to exist. See Slice 6.
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
depends on — **17 spec files call `signUpViewer` and 17 call `finishSignup`**
*(corrected from 18 by the 4a reviewer and verified by grep — the wrong number had
propagated out of this plan into a code comment)*:

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
  signature and body alone **in this slice**. **⚠️ The reason this slice was
  given was WRONG (defect #19), corrected here so no later builder inherits it:**
  it read "a profile row requires a `display_name` and a zip requires a profile
  row, so `finished ⟺ homeZipSet`". That is false under decision 5's order — the
  area card is **card 5 of 5**, so a zip arrives mid-run. Leaving the function
  alone was still correct **for 2b**; the `(true, true) → HOME_PATH` branch is
  **Slice 6's to remove.**
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
- **The bare-render seam (decision 16).** ⚠️ **The plan used to claim an
  `isFirstRun` constant "already exists" — it does not.** Measured: `App.tsx:205`
  is an **inline** `pathname === ONBOARDING_PATH` inside the redirect branch and
  nothing else. Create the constant and use it for the redirect branch too, so
  there is still exactly one comparison.
  Suppress, for that route only: the `<header>` (`App.tsx:232`), the `<nav>`
  bottom bar / rail (`App.tsx:280-304`), and the `PushOptInPrompt` mounted in
  `<main>` (`App.tsx:319` — this is decision 10's mechanism; do not add a second
  flag for it), plus the first-run resume nudge from Slice 3b.
  ⚠️ **AND THE TRAP — THE GRID AND THE PADDING MUST FOLLOW THE NAV, NOT
  `session`.** `App.tsx:228-229` sets the two-column grid
  (`md:grid-cols-[4.5rem_minmax(0,1fr)]`) from `session !== null`, and
  `App.tsx:306-311` sets `<main>`'s bottom padding to `6rem` for the same reason.
  On `/onboarding` the session IS non-null, so suppressing the nav without also
  dropping the rail column leaves **column 1 empty** — which is exactly the V22
  slice 9 FIX document at `App.tsx:213-225`: it collapsed `<main>` to 72px on a
  1024px viewport. **Do not re-introduce it.** Derive the grid column and the
  nav's bottom padding from whether the nav actually renders (one condition, used
  three times), and give the first run its own padding.
  **Do not reorder or restructure any guard above this point** — the seam is a
  render decision, not a routing one.
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

### Slice 3b: The account card and the trimmed signup

- **Objective:** a new parent creates an account with email + password and lands
  on the name card — **and every shared e2e helper moves with them, in this same
  slice.**
- **Files in scope:** `src/pages/LoginPage.tsx`, `src/pages/OnboardingPage.tsx`,
  **`e2e/fixtures.ts`**, **`e2e/auth.setup.ts`**,
  **`e2e/signup-zip-fallback.e2e.ts`**
- **⚠️ TWO SHARED SPEC FILES BREAK HERE AND NEITHER WAS IN ANY SLICE'S SCOPE.**
  Same class as the batch's first plan defect (`e2e/fixtures.ts`) — and worse,
  because one is the **setup project every spec depends on**:
  1. **`e2e/auth.setup.ts:54-61` fills `given-name`, `family-name` and
     `street-address` on `/login`** — all three fields this slice deletes. A break
     here is a **whole-suite** failure, not one spec's. **The good news, measured:**
     the name card this slice lands on carries the **same two selectors**
     (`autoComplete="given-name"` / `"family-name"`, `OnboardingPage.tsx:374,391`),
     so the fix is an **order** change, not a rewrite — sign up with email +
     password, land on `/onboarding`, fill the name card, then the location step
     (`98107` + `5 miles`), then the feed. **The REST PATCH backstop stays exactly
     as it is** — it is what makes the marker's final location identical whichever
     branch runs.
  2. **`e2e/signup-zip-fallback.e2e.ts` dies here, not in Slice 5.** Both its tests
     fill `street-address` on `/login` (line 53) and assert
     `signup-zip-fallback-note` at the location step. The flag's **producer** is
     `LoginPage.tsx:224` (`markSignupZipUnresolved`, after a failed geocode) —
     delete the address and the producer is gone. Slice 5 was scheduled to retire
     this spec, but by then it has been failing for two slices. **Update it now**
     (*update, never delete*): the happy path becomes signup → name card → location
     step → feed, and the second test asserts the new truth — a signup with **no**
     address field lands on the interview with **no** fallback note. **Slice 5
     re-establishes the fallback coverage in its in-card form**; say so in a
     comment, so coverage is visibly *relocated* rather than lost.
- **The address leaves `/login` HERE, not in Slice 5.** Slice 5's approach used to
  say "move the address field out of `/login` and into this card" — that
  **contradicts this slice's own acceptance criteria**. Decision 4 (account first,
  email + password only) is the one that happens, so the removal is **3b's**.
  Slice 5 builds the card the address lands *on*.
- **Two carry-overs from 3a's review, both owned here because this slice owns both
  files next:**
  1. **Pin the form association.** `FirstRunCard`'s form-mode primary button sits
     *outside* the `<form>` and is joined to it purely by the HTML `form`
     attribute (`FirstRunCard.tsx:100-101` → `<form id="name">`). 3a's reviewer
     verified it is the right structure, and that **nothing pins it**: if the id
     and the attribute drift, **"Continue" silently submits nothing** — a dead
     step with no error and no console output. The three `/^Continue/` helpers
     (`e2e/fixtures.ts:418`, `e2e/auth.setup.ts:100`,
     `e2e/signup-zip-fallback.e2e.ts:149`) currently all resolve to the location
     step's button; once you move them onto the name card they exercise the
     association through a real spec. **Say in the report which helper now proves
     it**, because that is the only pin this surface will have.
  2. **`OnboardingPage.tsx:262-263` is stale** — "Refresh the shared session state
     before leaving so the shell's onboarding gate (and header) see the new home
     zip." Since slice 2b the gate does not key on the home zip and the header
     shows none. **Pre-existing** (byte-identical in 3a's parent, `18feb83:256`),
     not introduced by 3a — fix it here because you own the file.
- **Approach:** trim `/login`'s signup to email + password, label it `1 of 5`,
  and navigate to `/onboarding` on success. Rewrite `signUpViewer` to drop the
  three now-absent fields and walk to the name card; teach `finishSignup` the name
  hop; **reorder `e2e/auth.setup.ts`**; **update
  `e2e/signup-zip-fallback.e2e.ts`**. Fix the `OnboardingPage.tsx:262-263` stale
  claim while you are in that file.
- **Acceptance criteria:**
  - Signup collects email + password only; the given-name, family-name and
    street-address fields are gone from `/login`.
  - Signup success lands on `/onboarding`, not `/`.
  - Signup is labelled `1 of 5`; the name card is `2 of 5`.
  - `/login` no longer imports `composeDisplayName`.
  - `signUpViewer` no longer touches any removed selector, and `finishSignup`
    reaches the feed from the new sequence.
  - **`e2e/auth.setup.ts` completes the new sequence and the marker still ends
    with `home_zip=98107` / 5 mi** — the REST PATCH is unchanged, and the
    `/profile` `@handle` assertion still passes (the name now comes from the card).
  - **No signup spec touches a removed selector.** The test is a grep:
    `rg -n 'street-address' e2e/ src/pages/LoginPage.tsx` — **check each hit rather
    than the count**; a hit on a *place/address* surface is legitimate, a hit in a
    **signup** context is not.
  - **The form association is pinned** — name the helper that now proves it (see
    carry-over 1 below).
  - **The name card is still labelled `2 of 5`** and `finishSignup` reaches the
    feed from the new sequence.
- **Verification command:** `npm run verify`, then
  `npx playwright test e2e/golden-path.e2e.ts e2e/onboarding-gate.e2e.ts e2e/signup-zip-fallback.e2e.ts`
- **Budget:** one local builder context. This is the batch's **busiest** slice —
  it edits two production files and three spec files. If the context runs out
  mid-slice, **stop and report** with the partial diff rather than committing a
  half-moved signup; a signup that lands nowhere is worse than an unfinished one.
- **Depends on:** Slices 2b, 3a

### Slice 3c: The resume nudge, and the name card's prefill

- **Objective:** an unfinished run is **never a wall** — a dismissible "finish
  setting up" line whose action is the card the parent left off on, ignorable
  forever. **And a brand-new parent is not shown their email address as their
  name.**
- **Files in scope:** `src/App.tsx` (the nudge lives in `ProtectedShell` — there
  is **no `AppShell.tsx`**), `src/pages/OnboardingPage.tsx` (item 2)
- **⚠️ ITEM 2 — A REAL REGRESSION SLICE 3B INTRODUCED, AND IT WOULD SHIP TO THE
  FIRST COHORT.** Before 3b the name card was reachable only for first-time
  social sign-in, where `suggestedHandle` (`src/lib/oauth.ts:121`) derives a real
  name from the provider's metadata. **3b routes every email signup through that
  same card**, and for an email signup with no OAuth metadata `suggestedHandle`
  falls back to **the email's local part** — its own test pins it:
  `suggestedHandle({}, 'nicole@x.com')` → `'nicole'` (`oauth.test.ts:58`). So every
  new parent now sees their email fragment pre-filled as their **first name**
  (`OnboardingPage.tsx:64`, used at `:87-88`). Left alone, the first cohort's
  display names become lowercase email fragments, visible to other parents — and
  3b's own builder flagged it against its own diff. **Decide and implement:**
  either stop pre-filling a name for email signups at all, or derive one only from
  real name metadata. **State which, and why.** Do not change `suggestedHandle`'s
  contract for OAuth — its tests pin it, and it is right for that caller.
- **Approach (the nudge):** render the line for a signed-in parent whose first run
  is unfinished — **`nextUnfinishedCard(facts)` from `src/lib/firstRun.ts` decides
  which card the action points at**; `null` means the run is finished, so nothing
  renders. The facts are **read** from the session (`signedIn`, name, kids, photo,
  zip) and **never stored**.
- **Acceptance criteria:**
  - The line renders only for a signed-in parent with an unfinished run, and its
    target comes from `nextUnfinishedCard` — **not a hard-coded card**.
  - **THE LINE MUST NOT NAME A CARD THE LANDING DOES NOT RENDER.** 3c's first
    build rendered `FIRST_RUN_COPY[card].title` (`App.tsx:190-193`) and named
    questions the app does not ask — the kids/photo/area cards are unbuilt until
    4/5/6 — while also **mis-naming the one card that does exist**
    (`FIRST_RUN_COPY.name.title` says "What should we call you?" while the card
    renders "What’s your name?"). **The reviewer blocked on it. THE LINE STAYS
    GENERIC PERMANENTLY** (ruling after the fix round): it is
    **never wrong**, and naming a card couples the shell to the card inventory —
    the exact coupling that produced this finding. **`FIRST_RUN_COPY` is for the
    CARD; the nudge speaks `FIRST_RUN_NUDGE_COPY`.**
  - **It never renders at the same time as `PushOptInPrompt`**, and by decision 16
    it does not render on `/onboarding` at all (the first run shows neither).
  - Dismissible, and stays dismissed for the session. Never blocks, never modals,
    never redirects (decision 3, ADR 0001).
  - Tap target ≥44px, visible focus cue, dismissal announced.
  - **A new email signup's name card no longer pre-fills the email's local part**,
    and a social sign-in with real name metadata still pre-fills as it does today.
- **⚠️ WATCH ITEM FROM 3B'S REVIEWER — CHECK IT, DO NOT ASSUME IT.** If
  supabase-js ever delivered its `SIGNED_IN` event *after* the first `/onboarding`
  commit, the chain would be: `/onboarding` bounces to `/login`
  (`OnboardingPage.tsx:174-175`), the fresh `/login` mount has
  `justSignedUp = false`, so its guard sends the parent to `/`
  (`LoginPage.tsx:68-69`) — **stranded on the feed with no profile row and no
  nudge.** The reviewer could not prove it from the diff and believes supabase-js
  emits the event synchronously during `signUp`, so it is **not** a 3b defect:
  read the flow, and if your nudge is what makes that state survivable, say so in
  the report. **If you can prove the race is real, report it as a finding rather
  than fixing it silently.**
- **Verification command:** `npm run verify`, then
  `npx playwright test e2e/golden-path.e2e.ts`
- **Budget:** one local builder context. Small — the decision logic is already
  pure and tested (Slice 1).
- **Depends on:** Slice 3b
- **Why this is a separate slice from 3b:** 3b's job is load-bearing (the flow plus
  every shared helper). Mixing in a new shell UI element would make a failure
  ambiguous — you could not tell a broken flow from a nudge bug. Same reasoning
  that split 3a from 3b.

### Slice 4a: The kids card — and the cards start reading the copy module

- **Objective:** card 3 collects kids (first name + age) with a working Skip, and
  **the cards begin rendering their words from `FIRST_RUN_COPY`** so no card
  carries a second voice.
- **⚠️ SLICE 4 IS SPLIT — a measurement decision, not a hedge.** As written it was
  two cards **plus** a cross-cutting copy adoption **plus** a `lib/` extraction.
  Mixing a refactor with two new cards makes any failure ambiguous — the same
  reasoning that split 3a from 3b and 3b from 3c. **4a = the kids card + the copy
  adoption. 4b = the photo card + the `hasAvatarUrl` extraction + that card's
  nudge title.**
- **Files in scope:** `src/pages/OnboardingPage.tsx`,
  `src/lib/firstRunCopy.ts` and its test, **`e2e/fixtures.ts`**
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
  - **⚠️ ADOPT THE COPY MODULE — THIS IS DEFECT #20'S FIX, AND IT IS LOAD-BEARING.**
    Measured: **`FIRST_RUN_COPY` (`src/lib/firstRunCopy.ts`) has exactly ONE
    consumer — the resume nudge — and NO card reads it.**
    (`rg -n "FIRST_RUN_COPY" src/ --glob '!*.test.ts'` returns only `App.tsx` and
    the module.) The name card **hard-codes** its own words:
    `OnboardingPage.tsx:347` is `title="What’s your name?"`, while the module says
    `"What should we call you?"` — **two sources of truth for one card, already
    drifted on day one.** So: **your two cards render their title, body and
    primary label from `FIRST_RUN_COPY`**, and you **reconcile the name card's
    hard-coded strings to the module** (pick the module's wording — it is the
    tested artifact — or change the module and its test; do not leave both). Then
    a card's title is true in the nudge **by construction**, because the nudge and
    the card read the same module. **Then re-enable that card's title in the
    nudge** (`src/App.tsx`) for the cards you have built — and only those.
- **Verification command:** `npm run verify` and
  `npx playwright test e2e/golden-path.e2e.ts`
- **Budget:** one local builder context.
- **Depends on:** Slice 3c

### Slice 4b: The photo card, and the avatar predicate

- **Objective:** card 4 collects a photo (reusing the crop step) with a working
  Skip, and the "has an avatar" rule stops being written inline in three places.
- **Files in scope:** `src/pages/OnboardingPage.tsx`,
  `src/components/useCropStep.tsx` (reused, not rebuilt — **note the `.tsx`
extension; there is no `useCropStep.ts`**), **a new `src/lib/` predicate for "has
  an avatar" and its sibling test**, `src/App.tsx` (the nudge uses it),
  **`e2e/fixtures.ts`**
- **Approach:** lift the existing avatar-upload logic into the card chrome. The
  crop step is **reused as-is** — it already validates size and type before
  decoding (`useCropStep(onConfirm, validateFile) → { beginCrop, dialog, busy }`,
  `src/components/useCropStep.tsx:26-45`). Skipping advances without writing. **This
  is a reorder, not a verbatim lift:** the existing page runs photo
  (`OnboardingPage.tsx:~515`) before kids (`:~548`); the chosen card order is kids
  then photo — and 4a already moved kids ahead.
- **Acceptance criteria:**
  - The photo card reuses `useCropStep` and `uploadAvatar`; a rejected file shows
    the existing error and does not trap the card.
  - Skip advances past the card without writing anything.
  - A failure writing the photo is surfaced and does not block Continue.
  - The card reads `4 of 5`, **rendering its title, body and primary label from
    `FIRST_RUN_COPY`** (4a established the pattern — follow it, do not hard-code).
  - **⚠️ EXTRACT THE AVATAR PREDICATE — IT EXISTS IN THREE DIFFERENT FORMS
    (measured, not assumed).** The plan first said "inlined twice"; the real picture
    is worse: `src/App.tsx:167` checks
    `avatar_url !== undefined && !== null && !== ''`;
    `src/pages/ProfilePage.tsx:1218` checks only `!== null && !== undefined` (**no
    empty-string clause** — it would render an `<img src="">` if `''` is reachable);
    and `src/lib/places.ts:1068` checks `photo_url !== null && !== ''` (a **different
    field**, and no `undefined` clause). The build law and this repo's own precedent
    (`src/lib/homeZip.ts`'s `hasHomeZip`, whose `zip != null && zip !== ''` covers
    both null-ish values in one clause) say this belongs in `src/lib/` as a **tested
    pure function**. Extract `hasAvatarUrl(url: string | null | undefined): url is
    string`, give it a sibling test, use it in the nudge, and **report whether
    `ProfilePage.tsx:1218` is a live bug** — fixing ProfilePage is **Slice 7's**, not
    4b's.
  - **⚠️ REMOVE THE BIO FIELD FROM THE FIRST RUN (decision 15 — plan defect #21).**
    Decision 15 is settled: "Bio drops out of the first run. Stays on the existing
    `/settings` nudge and V27's parent-card editor." **Nothing implemented it.** The
    bio field is still rendered **and still written** from this page: `bio`/`bioError`
    (`:125`/`:126`), the `updateBio` call in `handleContinue` (`:306-313`), and the
    field itself (`:662-664`). This was **not** a deliberate deferral — the plan said
    "not a `profiles.bio` cleanup (ticket 01)", meaning **the column**, so the
    **field** fell between the two and nobody owned it. Delete the field, its state,
    its validation surface and its write; leave `/settings` and the column alone.
    **Then grep, not assume:** `rg -n "bio" e2e/` — a spec that fills bio through the
    signup walk would break, and `finishSignup` has 17 consumers.
  - **The nudge stays GENERIC — do NOT add this card's title to it.** Ruling
    (orchestrator, after defect #20): the generic line is **never wrong**, and
    naming a card couples the shell to the card inventory, which is precisely how
    the blocking finding happened. `FIRST_RUN_COPY` is for the CARD; the nudge
    speaks `FIRST_RUN_NUDGE_COPY`.
  - `finishSignup` walks the new photo hop.
- **Verification command:** `npm run verify` and
  `npx playwright test e2e/avatar.e2e.ts`
- **Budget:** one local builder context.
- **Depends on:** Slice 4a

### Slice 5: The area card

- **Objective:** card 5 collects a location by address first, ZIP as fallback,
  plus a radius.
- **Files in scope:** `src/pages/OnboardingPage.tsx`, `src/lib/geocode.ts`
  (reused), `src/lib/feed.ts` (reused), `src/lib/onboarding.ts` +
  `src/lib/onboarding.test.ts` (retiring the fallback flag),
  `e2e/signup-zip-fallback.e2e.ts`, **`e2e/fixtures.ts`**
- **⚠️ `src/lib/account.ts`'s `addressFieldError` is NOT dead — it is this slice's
  to reuse.** Slice 3b removed the signup address and left `addressFieldError`
  with **zero non-test callers**; it now looks like dead code and a tidy-minded
  builder would delete it. **Do not.** This card asks for an address, so the
  validator that already exists and is already tested is exactly what it should
  call. If you decide not to reuse it, say why in the report rather than deleting
  it silently.
- **Approach:** **the address ALREADY left `/login` in slice 3b — do not remove
  it a second time.** This card is where it lands: reuse `zipFromAddressQuery`
  from `src/lib/geocode.ts`. An address that does not resolve reveals the ZIP
  field with the existing unresolved-address notice. Radius keeps
  `RADIUS_MILES_OPTIONS` and `DEFAULT_RADIUS_MILES`.
  **This slice retires the signup-ZIP-fallback mechanism.**
  `SIGNUP_ZIP_FALLBACK_KEY`, `markSignupZipUnresolved` and
  `consumeSignupZipUnresolved` exist for exactly one purpose: carrying "your
  signup address didn't resolve" across the `/login` → `/onboarding` route
  change. **The address and its failure now live on the same card, so the
  crossing is gone.** Remove all three symbols and their tests, and repurpose
  `e2e/signup-zip-fallback.e2e.ts` to assert the in-card notice — *update, never
  delete*. **(Slice 3b already updated that spec to the post-3b flow, because the
  flag's producer died there; here it gains the in-card notice assertion, so the
  coverage is relocated rather than lost.)**
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
  - The card reads `5 of 5` and writes the zip.
  - **Do NOT add this card's title to the resume nudge** — it stays generic
    (defect #20's ruling).
  - **The ending it lands on is Slice 6's, not this slice's.** Do **not** build a
    finish card here and do **not** touch the redirect guard. Completing the area
    card still lands on the day-1 end state (the feed) until Slice 6 re-keys the
    guard — an accepted, recorded sequencing cost. **The plan previously claimed
    this card "lands on the finish card", which was unimplementable (defect
    #19); that criterion belongs to Slice 6.**
- **Verification command:** `npm run verify` and
  `npx playwright test e2e/address-maps.e2e.ts e2e/zip-radius.e2e.ts e2e/signup-zip-fallback.e2e.ts`
- **Budget:** one local builder context.
- **Depends on:** Slice 3b

### Slice 6: The finish card — places near you

- **Objective:** the flow ends on up to three real nearby places, not an empty
  feed.
- **Files in scope:** `src/pages/OnboardingPage.tsx`, `src/lib/places.ts`
  (reused read path), the finish card's presentational component,
  **`src/lib/onboarding.ts` and its test**, **`e2e/onboarding-gate.e2e.ts`**,
  **`e2e/fixtures.ts`**
- **Approach:** reuse the places read the directory already uses — do not add a
  query shape. Prefer places with hours. Each place offers a path into hosting a
  drop-in there; the CTA must not be a dead end for a parent with no location.
- **⚠️ THE GUARD RE-KEY IS THIS SLICE'S, AND THE ENDING IS UNREACHABLE WITHOUT
  IT (plan defect #19).** Measured: `OnboardingPage.tsx:174-175` calls
  `resolveOnboardingRedirect(session !== null, homeZipSet)` and renders
  `<Navigate>` on a non-null answer; `src/lib/onboarding.ts:53-60` returns
  `HOME_PATH` whenever `homeZipSet` is true. **Slice 5's area card is card 5 of
  5, so it creates exactly that state** — the parent is bounced to the feed
  before this card can render, and `finishSignup` can never pass through it.
  **Re-key it in this slice:** signed out → `LOGIN_PATH`; otherwise `null`
  (render). `/onboarding` then renders the card `nextUnfinishedCard(facts)
  names, and **the finish card when it returns `null`** — which is what this
  slice's "reaching this card ends the run" criterion already assumes. A parent
  who already finished and re-visits `/onboarding` lands on the finish card;
  that is the intended ending, not a bug. **Update the unit test and
  `e2e/onboarding-gate.e2e.ts`'s pin in this same slice** — a spec that pins
  behaviour you change is your obligation (the batch's own invariant). If the
  card, the re-key and the spec cannot fit one context, **STOP and report with
  the partial diff rather than committing a half-moved ending.**
- **Acceptance criteria:**
  - With places near the parent, the card shows at most three, each linking to a
    real place.
  - With no places near the parent, the card falls back to the flow's honest
    empty state and still offers a next step.
  - The card makes no claim about upcoming drop-ins — there are none.
  - Reaching this card ends the run: `nextUnfinishedCard` is `null` afterwards.
  - `finishSignup` passes through the finish card to reach the feed.
- **Verification command:** `npm run verify` and
  `npx playwright test e2e/onboarding-gate.e2e.ts`
- **Budget:** one local builder context — **now carrying the guard re-key and its
  spec, so watch the window; report rather than overrun.**
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
    `.ts` (there are **zero `.tsx` test files**), so a
    component-level branch has no unit lane. The e2e must check that a no-zip
    parent's feed renders `location-required-notice` and **not**
    `empty-radius-state`. If it cannot be built, say why in the report rather
    than leaving the gap unnamed.
  - **THE STALE "signup is first + last name + address" COMMENT IS GONE FROM
    `e2e/`.** 3b's reviewer found it once (`kid-names-privacy.e2e.ts:148`) and the
    orchestrator found it in **four** files — `kid-names-privacy.e2e.ts:148`,
    `zip-radius.e2e.ts:68`, `while-away.e2e.ts:105`, `reactions.e2e.ts:83`.
    **THE LIST IS PROVABLY INCOMPLETE, so do not work from it: run
    `rg -n "V20 t06" e2e/` and `rg -n "first \+ last" e2e/` and fix every hit that
    describes the signup form.** This is the third time this batch that "a sweep
    named one" turned out to mean "there are more" (`feed.ts:49` was another).
  - **3b's review nits**, each cited so none is a judgment call on the day:
    - `e2e/signup-zip-fallback.e2e.ts:106` — the `toHaveCount(0)` runs on the
      **feed**, where `signup-zip-fallback-note` can never render, so it is a
      weak leak-check whose comment ("no fallback note anywhere") overclaims. The
      real pin is `:136`. Either strengthen or re-word the comment.
    - `e2e/signup-zip-fallback.e2e.ts` — **no trailing newline** (verified with
      `xxd`: the file ends `)`). Repo style is mixed, so this is cosmetic — but
      unlike the *false* newline finding a reviewer once made against
      `src/lib/a11y.ts`, this one is real, so do not dismiss it by pattern.
    - `src/lib/geocode.ts:11` — "V20 t06 adds `zipFromAddressQuery`, the **signup
      form's** use of the same service" is stale: the signup form no longer
      collects an address, and this slice re-homes it on the area card. Reword.
    - `src/pages/LoginPage.tsx:116-117` — "A signed-in caller (the 'signed out on
      /login' case) already has the account" describes a state the page's own
      guard makes unrenderable. Cosmetic; reword or delete.
  - **THE BATCH-END MARKER SWEEP RUNS.** Any run that created `e2e-` accounts is
    required by `docs/agents/e2e-fixture-convention.md` to end with the
    documented operational sweep. 3a's builder created two
    `e2e-seam3a-…@gmail.com` accounts (plus one `Seam Check` profile row) during
    its own runtime checks; 3a's reviewer confirmed both match the sweep's
    `email like 'e2e-%'` set and that the profile row cascades. **Run
    `node scripts/sweep-e2e-markers.mjs delete` then
    `node scripts/sweep-e2e-markers.mjs verify` and paste both tails.** Every
    other slice's e2e runs add to this pile too, so this is the last word on it,
    not a tidy-up.
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
     every new card breaks. **17 spec files call each helper** (18 was wrong — see the
4a note). Added as a
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

- 2026-09-29 — **Grounding the NEXT slices found plan defect #19, and it is
  load-bearing: the finish card was unreachable by construction.** The plan
  asserted in three places that `finished ⟺ homeZipSet` and forbade re-keying
  `resolveOnboardingRedirect`. MEASURED: `OnboardingPage.tsx:174-175` renders
  `<Navigate>` when `resolveOnboardingRedirect` returns non-null, and
  `src/lib/onboarding.ts:53-60` returns `HOME_PATH` whenever `homeZipSet` is
  true. The area card is **card 5 of 5** (decision 5), so Slice 5's own success
  writes exactly that state — the parent would be **bounced to the feed before
  the next card could render**. Consequences: Slice 5's criterion "finishing it
  lands on the finish card" was **unimplementable**, Slice 6's card was
  **unreachable**, and `finishSignup` could never pass through it. Corrected in
  place: the `resolveOnboardingRedirect` bullet, Slice 2b's now-false *reason*
  (kept because 2b's instruction was still right for 2b), Slice 5's criterion
  (the ending is Slice 6's, and this slice must not build a finish card or touch
  the guard), and **Slice 6 gains the guard re-key as a named item** with its
  scope (`src/lib/onboarding.ts` + test, `e2e/onboarding-gate.e2e.ts`) and its
  verification command. **Slices 1–3 are unaffected** — a parent cannot hold a
  zip without a name, so the guard's done-set and `nextUnfinishedCard`'s still
  agree; the defect lands only on Slice 5's final landing and Slice 6's whole
  reason to exist. Found by reading the page rather than the plan, which is now
  the nineteenth defect this batch has caught that way.

- 2026-09-29 — **3c's review found the batch's first BLOCKING finding, and
  grounding its root cause produced plan defect #20.** The nudge rendered
  `FIRST_RUN_COPY[card].title`, so it named questions the app **does not ask** —
  the kids/photo/area cards are unbuilt until Slices 4/5/6 — and it **mis-named
  the one card that does exist** (`FIRST_RUN_COPY.name.title` = "What should we
  call you?" while the card renders "What’s your name?"). Root cause, measured:
  **`FIRST_RUN_COPY` has exactly ONE consumer, the nudge, and NO card reads it.**
  The cards hard-code their own words, so the nudge speaks **a second voice that
  had already drifted on day one**. The plan pinned the module in Interfaces but
  never said **who consumes it**, and the answer was nobody. Fixed in place: 3c's
  acceptance forbids naming a card the landing does not render; **Slice 4 gains
  the copy-module adoption** (its cards render from `FIRST_RUN_COPY`, the name
  card's hard-coded title is reconciled, and the nudge re-enables a title only for
  cards that exist); **Slice 5 gains the same nudge note**; and Slice 4 also gains
  the **extracted avatar predicate** (`hasAvatarUrl` in `src/lib/` with a sibling
  test) because `App.tsx:158-159` inlines a rule already inlined at `db.ts:2521`.
  **Also recorded:** the new `react(set-state-in-effect)` warning took lint 80 → 81
  and is **accepted as recorded baseline movement** (the reviewer ruled it not
  worth blocking; the repo carries 80 of that class); the held-push-note
  co-render is **an accepted residual filed as `issues/03`** (its fix needs
  `PushOptInPrompt.tsx`, which **no slice owns**); and the orchestrator's own
  greps produced **two false negatives in one turn** — `rg -rn` parsed as `-r n`
  and *fabricated* output, then an **ASCII apostrophe** in a pattern missed the
  card's **typographic** `’`. **The reviewer's citations were right and mine were
  wrong, twice.** Third and fourth instance of the batch's recurring lesson that a
  no-match from a broken search is not a no-match.

- 2026-09-29 — **Slice 3c CLOSED: VERIFIED PASS** (verifier run `bbf62344`) at
  `5485384`. Gate exit 0, **65 files / 1978 tests** (the +3 fully explained by the
  new `FIRST_RUN_NUDGE_COPY` describe), **lint 0 errors / 81 warnings — 81, not
  82**, the single accepted warning moved to `App.tsx:138` as the fix's diff
  shifted it. The blocking finding is **provably gone**: no card-title reference
  survives in `App.tsx`, and the new test genuinely asserts the nudge's text
  contains **none of the five per-card titles** (verified by reading the assertion,
  not its name — with the honest caveat that it covers title+body, not
  `actionLabel`, and guards the copy object rather than the render site, which the
  empty grep covers). `FIRST_RUN_COPY`'s orphan status is confirmed. Scope = 4
  files; the throwaway driver is untracked.
- 2026-09-29 — **Slice 4 SPLIT INTO 4a AND 4b ON MEASUREMENT.** As written it was
  two cards **plus** the cross-cutting copy-module adoption **plus** the
  `hasAvatarUrl` extraction — and mixing a refactor with two new cards is what made
  3a/3b and 3b/3c ambiguous under failure. **4a** = the kids card + the copy
  adoption + `e2e/fixtures.ts`. **4b** = the photo card + the `hasAvatarUrl`
  extraction + that card's nudge title.
- 2026-09-29 — **The verifier caught TWO FALSE EXPECTATIONS IN THE ORCHESTRATOR'S
  OWN BRIEF** — the first time this batch that a bad claim came from the brief
  rather than the code. It said the accepted lint warning was at `App.tsx:130`
  (it is at `:138`; same single warning, count 81, moved by the fix's diff) and
  asserted `rg "other callers" src/` would be empty (**it is not** — two hits
  predating the commit, in the unrelated map components). **A brief's expected
  values are themselves claims, and a verifier that only checks what it was told
  to check would have "confirmed" both.** Also recorded: the known `/tmp`
  git-clone flake **reproduced** this time (hardlink error, 1/1978 in the test
  stage) and passed 26/26 in isolation — a reproduction is a stronger datum than
  the previous non-reproduction, and the guard's isolation pass is what keeps it
  environmental. And **the fix round fixed one stale "slice 3b" comment and MISSED
  A SECOND** (`App.tsx:387`, "slice 3b's resume nudge" — the nudge is 3c): the
  fifth instance this batch of "the sweep named one, so there is one". **Named
  obligation for Slice 7: `App.tsx:387`, found by grepping, not by trusting a line
  number — the earlier fix fixed `:367`, a different line in the same file.**

- 2026-09-29 — **Slice 4a: REVIEW PASS** (`d265785c`), no fix round. Six
  non-blocking findings and four accepted residuals, every one assigned by name
  below. Verified by the reviewer: Skip writes nothing; the blank-row skip is
  correct (a name-only or age-only row is **validated, not silently written**); the
  cap is enforced by `addKid` itself; a write failure stays on the card with
  `role="alert"` and Skip remains available, so **the run can always advance**; and
  there is **exactly one kids writer** — the whole point of 2a's lesson, now
  confirmed by grepping the write function's call sites rather than its handler
  names. The `radiusMiles` union was ruled a **legitimate documented union, not a
  loosening** (both forms preserved, a misuse fails loudly at `selectOption`), and
  its "predates V28" claim was **verified against `a0e93f2`**.
- 2026-09-29 — **⚠️ THE ORCHESTRATOR PUBLISHED A WRONG NUMBER, AND IT REACHED CODE.**
  This plan said **18** spec files call `signUpViewer`/`finishSignup` (twice), and
  the 4a brief repeated it — so the builder wrote **"the 18 specs that consume this
  helper"** into a comment in `e2e/fixtures.ts`. **The real count is 17**, verified
  by `rg -l`. The number has been wrong in this plan since the batch began, which
  makes it the batch's fifth "a count is a claim" instance and the first where the
  **orchestrator was the source**. Corrected in all three places; the code comment
  is assigned to 4b (F4). **A number in a brief is a claim with exactly the same
  status as a builder's — it must be grepped, not recalled.**
- 2026-09-29 — **4a's findings assigned by name.** To **4b**: **F3** the dangling
  parenthetical the diff itself left at `OnboardingPage.tsx:627`; **F4** the
  `fixtures.ts:397` count; **F6** the two sibling cards' inconsistent busy strings
  (`'Please wait…'` vs `'Saving…'`) — pick one. To **Slice 7**: **F1** the confirmed
  stale `App.tsx:86-87`; **F2** `OnboardingPage.tsx:49-52` (the location Continue
  no longer writes kids); **F5** **`skipLabel: 'Skip for now'` is read by nothing
  in production** (only pinned by its test, while `FirstRunCard` hard-codes
  `'Skip'`) — **a new instance of defect #20's exact shape: a module field no card
  reads** — either wire the chrome to it or delete the field, and update the `Skip`
  locators in `e2e/fixtures.ts` and `e2e/auth.setup.ts` if wiring; **R1** the kids
  write path still has **no e2e** (every spec walks Skip — close with one spec that
  fills a row, continues, and sees the kid on `/profile`); and **R2**
  **duplicate-kid re-entry** — the card starts from empty rows and does not pre-fill
  existing kids, so a pre-zip re-entry can rewrite the same kids, and a partial
  write failure (row 1 ok, row 2 fails) lets a retry duplicate row 1. **R2 predates
  4a** (the removed location-view loop had identical semantics), so it is a
  decision to make, not a regression to blame.
- 2026-09-29 — **SLICE 7 IS SPLIT (decided now, on the accumulated list, not when
  it is dispatched).** Its obligations are now a code/hygiene set plus a lane set:
  **7a = the code and hygiene fixes** (F1, F2, F5, R1, R2, `App.tsx:387`, the
  `db.ts:2521` avatar-predicate reconciliation, and removing `auth.setup.ts`'s
  duplicated walk now that the builder **answered the question: yes, `finishSignup`
  can cheaply subsume it** — the marker uses 98107 + 5mi, the helper's defaults, so
  only the REST backstop and the state-save stay spec-local). **7b = the batch-end
  lanes** (the full e2e sweep, the marker sweep, docs, and the no-zip e2e). The
  plan's single Slice 7 block gets restructured into 7a/7b before 7a is dispatched.
