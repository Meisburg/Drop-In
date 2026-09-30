# Implementation Plan: V28 r2 — the first run, revised after the playtest

**Bottom line:** r1 built and verified the first run (`account → name → kids → photo → area →
finish`), and a human walked it on a phone. r2 removes the standalone photo card, folds the
parent's photo onto the name card, adds optional kid photos and a map, and replaces the ending
with a **"How Drop In works"** card. Along the way it fixes three pieces of copy that
described something the app does not do.

- Base: the r1 tip on branch `Meisburg/onboarding` (pushed; preview live; production untouched)
- r1's plan is preserved as `plan-v28-r1-backup.md` — **r2 supersedes it; where they conflict,
  r2 wins, and the reversals are named below rather than left to be discovered**
- Gate per slice: **`npm run verify`** (build + test + lint + a11y + steering-lint + guards)
- Baseline that must not regress: **66 test files / 1989 tests, 0 lint errors / 81 warnings**

---

## Goal

A new parent finishes setup knowing (a) who they are, (b) who's coming, (c) roughly where
they live, and (d) **what the app actually does** — with their own photo and their kids'
photos attached while they are already on the relevant screen.

---

## 1. What changed since r1, and why

| r1 | r2 | The reason |
|---|---|---|
| 5 cards, `photo` standalone | 4 cards; the photo joins the **name** card | The parent is already on the name card; a whole screen for one photo is a screen they can skip out of. |
| Kids card: name + age | Kids card: name + age + **optional photo** | Same reason — a kid is being added right there. |
| Area card: address + radius | Area card: + **a map** | "5 miles" is an abstraction; the map makes the number mean something. |
| Finish card: **3 nearby places** | **"How Drop In works"** — the four tabs + the `+` | ⚠️ **This REVERSES r1 decision 12** ("its own places-near-you finish card"). The parent is about to land on a feed that already shows nearby activity; knowing what the app *does* is worth more at that moment than a list of parks. |
| Photo card skippable | Nothing new skippable; `skipLabel` now has one consumer | The photo is no longer a card. |

### The tour card is doing double duty — and that is the point

The playtest produced two asks that looked separate: *"explain what the tabs are for"* and
*"you can't search for a parent's name to message them"*. Measurement showed the second one is
**false** — name search and partner linking are both **built, reachable, and e2e-covered**
(`e2e/dm.e2e.ts` 3 tests; `e2e/account-links.e2e.ts` 5 tests).

So the real defect is **discoverability**, and the tour card is where it gets fixed: it must
**name both built capabilities** — finding a parent by name, and linking a partner. That is the
entire remedy for two features nobody can find (r2-D5, r2-D6).

---

## 2. The decisions r2 rests on

Carried from r1 and still binding: purpose is launch prep; the job is "learn about you, then
land on something real"; **name + area required, kids skippable, account not**; the run renders
bare; the push prompt keeps owning notifications; kids are first name + age only; the bio stays
out; drop-ins are seeded by hand; **resume never restarts**.

New in r2:

- **r2-D1 — the resume fix is e2e-verified but NOT human-verified.** The person who walked the
  flow went straight through. **Never round this up.** It stays the batch's open verification.
- **r2-D2 — the shape:** `account → name(+your photo) → kids(+kid photos) → area(+map) →
  How Drop In works → into the app`. `FirstRunCardId` loses `photo`; the denominator becomes 4.
- **r2-D3 — the tour is the last card** and replaces the finish card's list.
- **r2-D4 — the two copy defects belong to the NAME-CARD slice**, deliberately: both strings
  live on that card, which this revision rewrites. Fixing them standalone means writing them
  twice and putting two writers on one file.
- **r2-D5 — linking stays as-is.** No schema work, no shared kids, no shared drop-ins. Surfacing
  it is the whole remedy.
- **r2-D6 — name search keeps its reach** (any parent, name prefix). Narrowing it later is a
  *removal* of a shipped, tested capability and therefore its own decision.
- **r2-D7 — build the email partner invite** — the one part of the original ask with no existing
  seam (0 hits). **Not sliced yet**: the mechanism has not been measured.

---

## 3. The measured facts this plan rests on

Every one of these came from a read of the code, not from memory. Cited so a builder can check
rather than trust.

1. **The card model is one array.** `FirstRunCardId` (`src/lib/firstRun.ts:15`),
   `FIRST_RUN_CARDS` (`:17`), `isSkippable` (`:35`, true for `kids` and `photo`),
   `nextUnfinishedCard`'s photo branch (`:62`), the `hasPhoto` fact (`:26`),
   `progressLabel` emits `"N of 5"` (`:74`).
2. **Pinned by tests** — the array equality (`src/lib/firstRun.test.ts:103`), `progressLabel`
   1..5 (`:191-195`), the photo branch (`:133-135`). These must change *with* the model.
3. **The onboarding "of 5" sweep is measured, and it has TRAPS.** There are **32** `of 5` hits
   in `src/`, and only **21** are the label:
   - **The label (change these):** `OnboardingPage.tsx:55,58,177,229,455,573,705,808,869`;
     `LoginPage.tsx:31,105,150,228`; `FirstRunCard.tsx:37`; `firstRun.ts:73`;
     `firstRun.test.ts:191,192,193,194,195`. Plus e2e: `fixtures.ts:337,341,389,390,391,435,439,449`;
     `auth.setup.ts:21,30,66,83,103,111,119`; `onboarding-resume.e2e.ts:6,14,36,81,93,94,179`;
     `signup-zip-fallback.e2e.ts:10,61,81,92,101`.
   - ⚠️ **NOT the label — do not touch:** `reviews.ts:198`, `reviews.test.ts:194,195,199,205,206`,
     `PlaceDirectory.tsx:1419,1425,1534`, `PlaceDetailsPage.tsx:197` — these are **star ratings**
     ("4.3 out of 5"); and `InboxPage.tsx:607`, an unrelated live-data note. **11 of the 32 hits
     are these.** A blanket `rg "of 5"` sweep would rewrite review copy — that is the trap.
   - ⚠️ **Also not the label:** `firstRun.test.ts:206` (`"const label = '2 of 5'"`) is a **fixture
     string fed to the purity scanner** to prove prose is out of scope. Changing it breaks a
     different test's premise.
4. **The parent photo is a MOVE, not new plumbing.** Reuse `useCropStep`
   (`src/components/useCropStep.tsx`) and `uploadAvatar(profileId, source, rect)`
   (`src/lib/db.ts:2657`) exactly as the photo card does today.
5. **⚠️ THE CRUX — a kid photo CANNOT be attached to an unsaved kid.**
   `uploadKidPhoto(profileId, kidId, source, rect)` (`src/lib/db.ts:3092`) **requires a
   persisted `kidId`**. `addKid` (`:2946`) **returns** that id — and the kids card **throws it
   away** (its rows are plain `{name, age}`). ProfilePage proves the ordering:
   `handleKidPhotoUpload(kidId, …)` (`src/pages/ProfilePage.tsx:669`) is reachable only from
   `KidPhotoControl`, which holds a persisted id (`:2205+`).
6. **The map already accepts what the area card needs.** `PlacesMap` (`src/components/PlaceMap.tsx:195`)
   takes `homePin`, `radiusCircle`, and an optional `places` array that may be empty; reached
   through `PlaceMapLazy` (`src/components/PlaceMapLazy.tsx`) with a fixed-height fallback.
7. **Kids limits**: `MAX_KIDS_PER_PROFILE = 5` (`src/lib/db.ts:2364`); `useKidPhotoUrls`
   (`src/components/useKidPhotoUrls.ts`); paths in `src/lib/photoStorage.ts:90,118`, bucket
   `kid-photos` (`:64`).
8. **The photo card's own gate and testid**: `if (!photoCardDone && !hasAvatarUrl(profile.avatar_url))`
   (`OnboardingPage.tsx:828`), `photoCardDone` (`:237`), testid `first-run-photo-card` (`:848`).
9. **The nudge passes `hasPhoto`** into `nextUnfinishedCard` (`src/App.tsx:163`).
10. **`skipLabel` is DEAD AND WRONG.** `firstRunCopy.ts:42,48` says `'Skip for now'`;
    `firstRunCopy.test.ts:28-32` pins it; **`rg -n "skipLabel" src/` returns 0 render sites**;
    `FirstRunCard.tsx:117-120` renders a **hard-coded `Skip`**. The module documented as the one
    place the words live is lying about a word the parent sees.
11. **Dead exports, confirmed by two independent lanes**: `missingProfileItems` +
    `MissingProfileItem` (`db.ts:2513,2511`) — **0 production callers**;
    `needsOnboarding` (`src/lib/onboarding.ts:30`) — **0 production callers**.

---

## 4. Non-goals

- **Not touching partner linking or name search.** Both built, both tested, both stay as they
  are (r2-D5/D6). Surfacing them in the tour card is the only change.
- **Not narrowing name search** — that is a removal of a shipped capability and its own decision.
- **Not rewriting the finish card's places logic** beyond what deleting its one consumer forces.
- **No schema changes for the restructure.** (The email invite, when sliced, is the only
  possible migration in this batch.)
- Not re-opening any r1 decision that still holds.

---

## 5. Interfaces (pinned before dispatch)

### `src/lib/firstRun.ts` — the model after r2

```ts
type FirstRunCardId = 'account' | 'name' | 'kids' | 'area'   // 'photo' REMOVED
const FIRST_RUN_CARDS: FirstRunCardId[]                      // the 4, in order
interface FirstRunFacts { signedIn; hasName; hasKids; hasZip }  // hasPhoto REMOVED
isSkippable(card): boolean                                   // true for 'kids' only
nextUnfinishedCard(facts): FirstRunCardId | null             // no photo branch
progressLabel(card): string                                  // "1 of 4" … "4 of 4"
```

**The invariant to pin:** `progressLabel` reads its denominator from `FIRST_RUN_CARDS.length`,
never from a literal — so a future card change cannot leave the count behind. (r2 is exactly
that change; make it impossible to repeat.)

### The ending card

A new `HowItWorksCard` (the `FinishRunCard` slot), showing `All done` plus one line per tab
and **naming both built capabilities**:

| Line | Copy intent |
|---|---|
| Drop Ins | what's happening near you |
| `+` | post your own drop-in |
| Places | where you could host |
| Inbox | message other parents — **search a parent by name to start** |
| Profile | you, your kids, your settings — **link your partner here** |

Presentational only (the build law): it takes `onGoToFeed` and renders. It makes **no claim
about places** — there is no places read any more.

---

## 6. Slices

Each slice: objective → files → approach → acceptance → verify → depends → budget.
**`e2e/fixtures.ts` is a per-slice obligation** — 17 spec files call `finishSignup`, so a slice
that changes the card sequence must keep them walking it.

### ⚠️ Slice 1 is ONE slice dispatched in two builder contexts: 1a + 1b

**Measured defect in this plan, found by 1a's builder and confirmed by me:** removing `'photo'`
from `FirstRunCardId` is a **type-level** change. `FIRST_RUN_COPY` is declared
`Record<FirstRunCardId, FirstRunCardCopy>` and still carries a `photo` entry
(`src/lib/firstRunCopy.ts:44`), read at `src/pages/OnboardingPage.tsx:829`; one test reads
`.photo.skipLabel` (`firstRunCopy.test.ts:29`). So **1a cannot satisfy the gate alone** — it
leaves six `tsc` errors in files it does not own. The split was made for token budget, not for
independence, and the brief's claim that "the build stays green in 1b" was simply false.

**Ruling:** 1a and 1b are **one slice in two parts**, and **the gate applies to the pair**
(`npm run verify` must exit 0 at the end of 1b). 1a's commit is red by design and is labelled as
such — a red commit nobody explains is indistinguishable from a mistake.

### Slice 1a — the model loses `photo`, the denominator becomes 4

- **Objective.** `firstRun.ts` and its test describe four cards.
- **Files.** `src/lib/firstRun.ts`, `src/lib/firstRun.test.ts`.
- **Approach.** Remove `'photo'` from the union and the array; drop `hasPhoto` from the facts and
  the photo branch from `nextUnfinishedCard`; `isSkippable` true for `kids` only. **The
  denominator is ALREADY derived** — `progressLabel` reads `FIRST_RUN_CARDS.length`
  (`firstRun.ts:74`), so this slice does not add that; it must simply **stay** that way, and the
  acceptance proves it does.
- **Acceptance.** `progressLabel('area') === '4 of 4'`; no `'photo'` in the union, array, or
  facts; the test pins the new array **and** that a skippable-vs-required decision survives for
  the remaining cards; zero references to `hasPhoto` remain in the module.
- **Verify.** `npm run verify`.
- **Depends on.** Nothing. **Budget.** small.

### Slice 1b — every call site and every stale "of 5" tells the truth

- **Objective.** The app and its specs stop saying five, and `npm run verify` goes green.
- **Files.** `src/App.tsx` (`:167`, plus the comment at `:93`), `src/pages/OnboardingPage.tsx`
  (gate `:828`, state `:237`, card JSX `:848`, the facts object `:300`, the `photoCardDone`
  comments `:72,233`, the copy read `:819,829`, comment sweep per fact 3),
  `src/pages/LoginPage.tsx` (comment sweep), **`src/lib/firstRunCopy.ts` +
  `src/lib/firstRunCopy.test.ts` (delete the `photo` entry — see the ruling above; the copy
  *wording* stays slice 2's)**, `src/lib/avatarUrl.test.ts` (`:7`), and the four e2e files in
  fact 3.
- **Approach.** Delete the photo card's gate, state, JSX and testid; stop passing `hasPhoto`;
  reword every measured "of 5" occurrence — **the list in fact 3 is the scope, and a grep for
  `of 5` afterwards must come back empty in `src/`**.
- **Acceptance.** The label is gone from the app: `rg -n "of 5" src/pages/OnboardingPage.tsx
  src/pages/LoginPage.tsx src/components/FirstRunCard.tsx src/lib/firstRun.ts` → **0 hits**, and
  `rg -n "first-run-photo-card" src/ e2e/` → **0 hits**. ⚠️ **A blanket `rg "of 5" src/` is NOT
  the check** — see fact 3: 11 hits are star ratings and one is a scanner fixture. Sweeping
  those would be a new defect, not a fix. The run reaches `area` and the ending without a photo
  card; the three walking specs (`onboarding-resume`, `signup-zip-fallback`, `auth.setup`) pass.
- **Verify.** `npm run verify` **and** `npx playwright test e2e/onboarding-resume.e2e.ts e2e/signup-zip-fallback.e2e.ts`.
- **Depends on.** 1a. **Budget.** medium — mechanical but wide.

### Slice 2 — the parent's photo joins the name card *(+ two copy defects)*

- **Objective.** Card 2 has first name, last name, and the parent's photo; the strings on it are
  true.
- **Files.** `src/pages/OnboardingPage.tsx`, `src/lib/firstRunCopy.ts` (+ its test),
  possibly `src/components/FirstRunCard.tsx`.
- **Approach.** Move the photo block (crop + `uploadAvatar`) from the deleted card into the name
  card, keeping the existing behaviour: the write happens on the crop step, so Continue and a
  skip-free advance only advance. Then fix **both r2-D4 defects**: the duplicate-name hint must
  stop advising a middle name or initial (no such field — `OnboardingPage.tsx:561`), and the
  body must stop saying *"A first name is plenty"* directly above a Last name field
  (`firstRunCopy.ts:35`) — say what the name IS for (how other parents find and recognise you),
  because it is the public handle.
- **Acceptance.** Uploading on card 2 stores the avatar and the card still advances; the name
  copy matches the fields shown; **`rg -n "middle name" src/` → 0 hits**.
- **Verify.** `npm run verify`.
- **Depends on.** 1b. **Budget.** medium.

### Slice 3 — optional kid photos on the kids card

- **Objective.** A parent can add a photo to a kid while adding the kid.
- **Files.** `src/pages/OnboardingPage.tsx`, `src/components/FirstRunCard.tsx` or a small new
  child component, `src/lib/db.ts` only if a helper wrapper is genuinely needed.
- **Approach.** **This slice exists because of fact 5.** Keep each `addKid` return value instead
  of discarding it, then call `uploadKidPhoto(profileId, kid.id, …)` through the shared
  `useCropStep`, and display via `useKidPhotoUrls`. A kid saved without a photo is normal, not an
  error. Respect `MAX_KIDS_PER_PROFILE`.
- **Acceptance.** Adding a kid **with** a photo stores it (bucket `kid-photos`) and it renders;
  adding one **without** is unaffected; the row's write still validates as today; the photo is
  never attached to a kid row that does not exist.
- **Verify.** `npm run verify`.
- **Depends on.** 1b. **Budget.** medium — the ordering is the whole risk.

### Slice 4 — a map on the area card

- **Objective.** The radius stops being an abstraction.
- **Files.** `src/pages/OnboardingPage.tsx`, using `src/components/PlaceMapLazy.tsx` /
  `PlaceMap.tsx` unchanged where possible.
- **Approach.** Once an address resolves, render `PlacesMap` with `homePin` + `radiusCircle`, and
  redraw when the radius changes. **The pending-state rule applies (r1's standing invariant):**
  anything async that gates a card needs a bounded escape — the existing
  `ADDRESS_LOOKUP_TIMEOUT_MS` behaviour and the ZIP fallback must keep working, and the map must
  **never** be the thing that traps a parent.
- **Acceptance.** With a resolved address: a map with a home pin and a radius circle; changing
  the radius redraws it; an unresolved or failed lookup still leaves Finish reachable by ZIP; no
  map-shaped claim is rendered before the address resolves.
- **Verify.** `npm run verify`.
- **Depends on.** 1b. **Budget.** medium.

### Slice 5 — the "How Drop In works" ending

- **Objective.** The run ends by teaching the app, not by listing parks.
- **Files.** `src/components/FinishRunCard.tsx` → the tour card (rename or replace), its consumer
  in `src/pages/OnboardingPage.tsx`, `src/lib/places.ts` (+ test) for what becomes dead.
- **Approach.** Remove the places read and the picks list. **Then handle what that orphans,
  explicitly**: `finishRunPlaces` / `FINISH_RUN_PLACE_LIMIT` / `placeHasHours` / `FinishRunPlace`
  become unused by the card — **wire-or-delete each by name**, never leave a test pinning a
  function nobody calls. **And `RadiusEmptyState`'s no-zip escape must stay reachable** (it is
  shared with the feed) — verify its other consumers before removing this render site. The tour
  copy must name both built capabilities (§5).
- **Acceptance.** The ending shows the four tabs + the `+`, one line each, plus a line naming
  **finding a parent by name** and **linking a partner**, and a CTA into the feed; **no claim
  about places anywhere on it**; every export it orphaned is either still called somewhere or
  deleted with its test; `RadiusEmptyState` still has a reachable render path.
- **Verify.** `npm run verify`.
- **Depends on.** 1b. **Budget.** medium.

### Slice 6 — `skipLabel` stops lying, and a guard so it cannot again

- **Objective.** The copy module describes the app truthfully, and this class of defect is
  mechanical from now on.
- **Files.** `src/lib/firstRunCopy.ts` (+ test), `src/components/FirstRunCard.tsx`,
  `src/pages/OnboardingPage.tsx`, `scripts/guards/` + `scripts/guards/run-all.sh`.
- **Approach.** Make the module tell the truth **and** be the single source of it: the button
  label comes from the copy module rather than a hard-coded literal. **Keep the rendered words
  the same as today** (`Skip`) by setting the module's value to what the design already ships —
  the fix is *truthfulness*, not a redesign. Then **build the guard**, because this is the
  **fourth** instance of this class in the batch: a check that every field of `FIRST_RUN_COPY`
  is either consumed somewhere in `src/` or explicitly allowlisted. Ship it with its
  `.check.mjs` proving it fires on the pre-fix state (the batch's guard rule).
- **A SECOND guard, because the same *planning* defect was made twice within the hour.** Two
  acceptance criteria out of my own pen claimed a **zero over an unscoped directory**, and each
  would have sent a builder to rewrite something it must not touch:
  - `rg "of 5" src/` — **32 hits, 11 of them star ratings** (`reviews.ts`, `reviews.test.ts`,
    `PlaceDirectory.tsx`, `PlaceDetailsPage.tsx`).
  - `rg "hasPhoto" src/` — `src/lib/places.ts:1070` has an **unrelated local of the same name**
    (a *place's* photo).

  The checkable rule: **a zero-hit claim must not match in a file the document never mentions.**
  Ship `scripts/check-acceptance-greps.mjs`: it extracts every acceptance grep line from
  `plan.md` and `.scratch/v28/briefs/*.md`, runs it against the tree, and fails when a zero-claim's
  pattern matches in an unreferenced file. **Its `.check.mjs` uses the two real defects above as
  fixtures** — the pre-fix text is in this repo's history, so the guard can be run against the
  state that produced it, which is this project's standing guard rule.
- **Acceptance.** The rendered label and the module agree; `rg -n "skipLabel" src/` shows a
  **render** site, not just the module; the new guard passes on HEAD **and** fails when run
  against the pre-fix state; `check-acceptance-greps.mjs` passes on the corrected `plan.md` and
  briefs **and** fails on the two recorded pre-fix fixtures; `run-all.sh` includes both.
- **Verify.** `npm run verify` (guards run last) **and** the guard's own `.check.mjs`.
- **Depends on.** 1b. **Budget.** medium.

### Slice 7 — the email partner invite → **NOT a slice. Its own batch, with a non-code critical path.**

Measured by a bounded explorer (`.scratch/v28/research/explore-r2-email-invite.md`). It is
bigger than it looked, in four ways:

- **Email can be sent today — but not to a chosen address.** The only sender is the `send-push`
  edge function: service-role only, pg_cron-driven, draining `notification_log`, and it mails a
  recipient's **own auth email** (`supabase/functions/send-push/index.ts:546-548`). **No
  endpoint, RLS policy or code path mails an address a user types — an explicit zero.**
- **The transport is already proven.** `_shared/smtp.ts` + `smtpDeno.ts` over Gmail SMTP,
  live-delivered 2026-09-26 (`docs/email-fallback-ops.md:211-218`). Resend exists but is
  **unselected — no API key, and no sending domain** (`:9-17,154`). SendGrid / Postmark /
  Mailgun / SES: **0 hits each**.
- **The token/claim/redeem pattern has ZERO prior art** — 0 hits for token, nonce, claim,
  redeem, pending_email, accept_url.
- **`account_links` cannot hold an un-joined invitee.** `requester_id` / `addressee_id` are
  **NOT NULL FKs to `profiles`** (`0047:186-187`), and both invariants it must respect
  (`account_links_one_pending_per_pair` `:225`; the one-active-partner trigger `:260-311`) are
  keyed on profile ids. → **a new table plus a token**, with the claim step creating the real
  `account_links` row at signup.
- **⚠️ An invite link does NOT survive signup today.** `LoginPage.tsx:152` navigates to a bare
  `ONBOARDING_PATH` after `signUp`; `:100` navigates to `/` after login; OAuth leaves the SPA
  entirely (`db.ts:332-333`); and `createProfile` (`db.ts:341`) takes no token. **The token must
  be captured *before* that navigate** — session storage or a server row. No existing seam does it.
- **Opt-out already exists and must be respected:** `profiles.email_optout` (`0053:52`), read by
  the sender as `decideEmailFallback({ emailEnabled, optout, email })`
  (`send-push/index.ts:531-554`), with a `List-Unsubscribe` header (`_shared/emailCopy.ts:133`).

**Therefore: schema + token + a sender seam + a signup-path change — not one builder context.**
It is planned as **its own batch after the restructure**.

**And it has a human prerequisite with lead time: an email SENDING DOMAIN.** Today the only
working transport is the Gmail account that carries auth mail, and there is no sending domain —
so invites to people who have never heard of Drop In are a deliverability problem no amount of
correct code fixes. **That is a decision plus a DNS change, not a build step.** Surface it early:
it is the only part of this feature that cannot be delegated.

### Slice 8 — hygiene (r1's deferred 7c), folded in rather than run first

Its items touch the same files this revision rewrites, so running it earlier would mean doing
part of it twice. Wire-or-delete `missingProfileItems` / `MissingProfileItem` /
`needsOnboarding` (fact 11: **0 production callers each**); the phrase-based stale-claim sweep;
extract `resolveCard(facts, skippedCards)`; `ProfilePage.tsx:1218`'s missing empty-string
clause; the `finishSignup` pre-resolved-zip option; remove `e2e/auth.setup.ts`'s duplicated walk.
- **Verify.** `npm run verify`. **Depends on.** 1b–6.

---

## 7. Risks / open questions

1. **The resume behaviour has no human confirmation** (r2-D1). This batch must not let it round
   up. Two non-vacuous e2e tests is the strongest claim we can honestly make.
2. **The kid-photo ordering (fact 5) is the one place a slice can silently do nothing.** A photo
   "uploaded" for a kid that was never persisted would look like success and store nothing.
   Slice 3's acceptance is written against exactly that failure.
3. **Slice 5 deletes the only consumer of a ranked-places function.** The temptation is to leave
   it "in case"; this repo's documented pattern is the opposite — a function pinned by a test and
   read by nobody — so each is wired or deleted **by name**.
4. **The email invite (slice 7) is the batch's only likely schema change** — and measurement
   moved it out of this batch altogether: it needs a new table, a token pattern with zero prior
   art, a sender seam, and a change to the signup path, whose query string is dropped today.
   **Its real blocker is not code but a sending domain**, which only a human can decide.
5. **The tour card is now load-bearing for discoverability.** If it ends up as four terse lines,
   the two hidden features stay hidden. Slice 5's acceptance names them explicitly for that
   reason.

---

## 8. Status log (orchestrator appends after every phase transition)

- r2 planning opened after the human playtest; four decisions recorded (r2-D1…D4).
- Two explorers returned measured facts; explorer B's headline (both "new features" already
  exist) was **verified by re-measurement** before it cancelled two slices, and its `skipLabel`
  claim was **disproved** by the same pass.
- Three product decisions recorded (r2-D5 leave linking, r2-D6 keep name search, r2-D7 build
  email invite).
- `plan.md` r2 written; r1 preserved as `plan-v28-r1-backup.md`. Slice 1a dispatched.
- Slice 1a's own acceptance check was **measured before dispatch** and found to be a defect of
  the plan's making (a blanket `of 5` sweep would have rewritten star ratings); corrected, as
  was its implication that `progressLabel` needed deriving when it already does.
- The email explorer returned: **the invite is its own batch, blocked on a sending domain.**
  Slice 7 rewritten from measurement rather than left as a placeholder.
