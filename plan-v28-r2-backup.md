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
     ("4.3 out of 5"); and `InboxPage.tsx:607`, an unrelated live-data note. **So the honest
     decomposition of the 32 is: 21 label + 1 note + 10 ratings.** A blanket `rg "of 5"` sweep
     would rewrite review copy — that is the trap.
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
8. **~~The photo card's own gate and testid~~ — SUPERSEDED, and NOTHING in this entry survives.**
   V28 r2 slice 1b DELETED the photo card (the picker moved onto the name card, r2 slice 2), so
   the gate as written (`if (!photoCardDone && !hasAvatarUrl(profile.avatar_url))`,
   `OnboardingPage.tsx:828`), `photoCardDone` (`:237`) and testid `first-run-photo-card` (`:848`)
   all left the tree. Re-measured by slice 8a at `8d1170d`: **`grep -rn "first-run-photo-card\|photoCardDone" src/`
   finds zero.** Kept because deleting it is what slice 1b was dispatched to do.
9. **~~The nudge passes `hasPhoto`~~ — SUPERSEDED by the same deletion.** `hasPhoto` is gone from
   `FirstRunFacts` (`src/lib/firstRun.ts`); the nudge now passes `signedIn / hasName / hasKids /
   hasZip` (`src/App.tsx:167` — measured at `8d1170d`, after slice 8a's own docblock
   edit in App.tsx moved it).
10. **`skipLabel` *was* DEAD AND WRONG — FIXED by V28 r2 slice 6a.** As written: `firstRunCopy.ts`
    said `'Skip for now'`; `firstRunCopy.test.ts` pinned it; **`rg -n "skipLabel" src/` returned 0
    render sites**; `FirstRunCard.tsx` rendered a **hard-coded `Skip`** — the module documented as
    the one place the words live was lying about a word the parent sees. **BOTH halves are false
    now**, which is why the entry is updated in place rather than deleted: the field is a PROP the
    chrome renders verbatim (the chrome keeps no label of its own), OnboardingPage passes it from
    the module, and the module's value equals the rendered word (`'Skip'`, pinned by
    `firstRunCopy.test.ts:41`). Re-measured by slice 8a at `8d1170d`: **`grep -rn skipLabel src/`
    finds 24 lines — the module's value (`firstRunCopy.ts:100`), the prop and its render
    (`FirstRunCard.tsx:72,130`) and the call site (`OnboardingPage.tsx:1378`). Not 0.**
11. **Dead exports, confirmed by two independent lanes — EXECUTED by V28 r2 slice 8a.** As written:
    `missingProfileItems` + `MissingProfileItem` (`db.ts:2513,2511`) and `needsOnboarding`
    (`src/lib/onboarding.ts:30`), **0 production callers each**. Slice 8a re-measured the count at
    `8d1170d` (still 0 — the only `src/` mention was a sentence in App.tsx's own docblock naming
    the seam the nudge does NOT use) and deleted all three with their tests: **`grep -rn` for
    either name across `src/ e2e/ scripts/` now finds only the retirement notes.**
12. **THE COLD START, measured on the live database this turn.** The product and research agents
    raised it; the numbers are mine, and they corrected two of the record's own:
    - **`playdates`: 20 rows, 19 with `status='on'`, 20 not hidden, and `starts_at > now()` = ZERO.**
      The newest is `2026-09-30 15:00:00+00` — already started when I looked.
    - **Every one of the 20 is hosted by someone whose `home_zip` is `98103`** — a single ZIP,
      verified by grouping the drop-ins on their host's profile.
    - **`profiles`: 97 total, 89 with a `home_zip`. `going_pings`: 4.**
    - ⚠️ **This corrects the record.** `task-state.md` says 16 drop-ins, latest 2026-09-26. Measured:
      **20** and **2026-09-30**.
    - ⚠️ **And it sharpens the agents' own framing.** They said a parent *outside 98103* gets an
      empty feed. Measured, **everyone gets an empty feed, because nothing is upcoming** — the seed
      drop-ins were planted for the playtest and have passed. **The cold start is temporal as well
      as geographic**, so the post-batch question is not only "who plants the second ZIP" but
      "who plants something **in the future**."

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
- **Acceptance.** The label is gone from the app.
  ACCEPTANCE-GREP: `rg -n "of 5" src/pages/OnboardingPage.tsx src/pages/LoginPage.tsx
  src/components/FirstRunCard.tsx src/lib/firstRun.ts` → **0 hits**.
  ACCEPTANCE-GREP: `rg -n "first-run-photo-card" src/pages/OnboardingPage.tsx
  e2e/onboarding-resume.e2e.ts` → **0 hits**. ⚠️ **A blanket `rg "of 5" src/` is NOT
  the check** — see fact 3: 10 hits are star ratings, one is an unrelated live-data note, and one
  is a scanner fixture. Sweeping
  those would be a new defect, not a fix. The run reaches `area` and the ending without a photo
  card; the three walking specs (`onboarding-resume`, `signup-zip-fallback`, `auth.setup`) pass.
- **Verify.** `npm run verify` **and** `npx playwright test e2e/onboarding-resume.e2e.ts e2e/signup-zip-fallback.e2e.ts`.
- **Depends on.** 1a. **Budget.** medium — mechanical but wide.

### Slice 2 — the parent's photo joins the name card *(+ two copy defects)*

- **Objective.** Card 2 has first name, last name, and the parent's photo; the strings on it are
  true.
- **Files.** `src/pages/OnboardingPage.tsx`, `src/lib/firstRunCopy.ts` (+ its test),
  possibly `src/components/FirstRunCard.tsx`, and — **added mid-flight when the builder proved this
  list could not produce a correct slice** — **`src/lib/db.ts`** (see the scope ruling below).
- **Approach.** Move the photo block (crop + `uploadAvatar`) from the deleted card into the name
  card, keeping the existing behaviour: the write happens on the crop step, so Continue and a
  skip-free advance only advance. **Measured: the hook survived 1b — `src/components/useCropStep.tsx`
  is shared and `ProfilePage.tsx:447,475,2222` still calls it, so this is a re-import, not a
  rebuild.** Then fix **both r2-D4 defects**:
  - **The handle-taken hint** (`OnboardingPage.tsx:515` — **not the `:561` this plan first said;
    1b's deletions moved it, and a stale line reference is how the last two briefs went wrong**)
    advises *“try adding a middle name or initial”"* while the card renders only First and Last.
    **The honest version already exists one page over:** `ProfilePage.tsx:835` says *“pick a
    different display name”* — actionable, no phantom field. Advise something the card can
    actually do.
  - **The body** says *"A first name is plenty"* (`firstRunCopy.ts:35`) directly above a Last name
    field. Say what the name IS for (how other parents find and recognise you) — it is the public
    handle.
  ⚠️ **SCOPE RULING — builder-found, measured, and correct.** The name card renders **only when
  `profile === null`** (`OnboardingPage.tsx:542`), so the row does not exist when the photo is
  cropped; `uploadAvatar`'s `avatar_url` UPDATE then matches **0 rows and is SILENT**
  (`db.ts:2663-2666` checks only `profileError`), which would leave the object orphaned and
  acceptance 1 unmet while looking like success.
  **Ruled: `createProfile(displayName, pendingAvatarUrl?)` gains an OPTIONAL second parameter** —
  one param, one existing call site (`:510`), the idempotent `23505` path untouched. Crop confirm
  calls `uploadAvatar` (so the object write happens there and Continue never waits on an upload),
  the returned URL is held in page state, and Continue passes it to `createProfile`.
  **Rejected:** holding a `File` + `CropRect` and re-decoding inside Continue — a second ~48MB decode
  that `uploadAvatar`'s own doc says the `source`+`rect` seam exists to avoid, plus Continue waiting
  on an upload — and re-scoping the slice. **The plan's own file list was the defect here: it forbade
  the minimal correct change.** A builder that asks once instead of silently crossing it is behaving
  exactly right, and this is the second time this batch has grown a slice's file list mid-flight.
- **Acceptance.**
  - Uploading on card 2 stores the avatar, and the card still advances — and **a FAILED upload must
    not block Continue**: the photo is optional, so the parent must still be able to create the
    profile (the pending-state rule, which every async step gating a card must satisfy).
  - ⚠️ **Distinguish the two states — the first cut did not, and `ocr` found the gap.** A **failed**
    upload must not block Continue, but an **IN-FLIGHT** upload must, or a parent who taps Continue
    between the crop confirm and the upload's resolution gets a row written with `avatar_url` NULL
    while the resolution sets state the advanced card no longer reads — **a photo silently orphaned,
    which is the very failure the scope ruling above exists to prevent.** So Continue is disabled
    while the upload is in flight (the same `busy` flag `useCropStep` already returns, which also
    removes the duplicated `photoUploading` state) — **and it carries the pending-state rule's
    bounded escape**, so a hung upload can never trap the parent on the name card.
  - **The photo does NOT gate Continue.** `signUpViewer` (`e2e/fixtures.ts:360-380`) fills
    given-name/family-name and clicks Continue **with no photo at all**, and **17 spec files** ride
    that hop — a gated Continue hangs all of them.
  - The name copy names only fields the card actually renders, and the handle-taken hint is
    actionable.
  - **The zero-hit claim is SCOPED, because the blanket form is itself a defect** — the third
    instance of the class slice 6's guard exists for. Measured today, `rg -n "middle name" src/`
    matches **three** files and only one is the defect: `OnboardingPage.tsx:515` (**the defect**) +
    `src/lib/oauth.ts:154` (a comment about OAuth name parsing) + `src/lib/oauth.test.ts:163` (a test
    name). **Correct criterion:**
    ACCEPTANCE-GREP: `rg -n "middle name|middle initial" src/pages/OnboardingPage.tsx`
    → **0 hits**, with those other two files **untouched**. **A third
    fixture for slice 6's guard.**
  - Any comment left false by the photo no longer being a *step* (start with
    `e2e/avatar.e2e.ts:3-5`, which explains why the spec drives `/profile` instead) is fixed here —
    **the slice that breaks a claim owns it.**
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
  ⚠️ **The ordering is DECIDED, and this is why.** `useCropStep` closes the bitmap in a `finally`
  the moment `onConfirm` resolves (`useCropStep.tsx` — *“Awaited BEFORE the close: the encoder reads
  this bitmap, so closing it first would blank the upload”*), so **there is no
  crop-now-upload-later**; and `uploadKidPhoto` (`db.ts:3092`) needs an id that exists. **Ruled: the
  row is written inside the photo's `onConfirm`** — `validateKid` → `addKid` → keep `kid.id` →
  `uploadKidPhoto` — and `handleKidsContinue` then writes **only rows that still have no id**.
  Two alternatives were measured and rejected: **encode-at-confirm + upload on Continue** needs a
  **new blob-taking upload seam plus its sibling test** (no such seam exists) to buy nothing this
  shape lacks; and a **two-phase card** (Continue writes, then the rows grow photo controls re-using
  `KidPhotoControl` verbatim) has the lowest-risk mechanics but hides them behind a second Continue
  and separates the photo from "adding the kid" — the opposite of this slice's objective.
  **If a measurement makes the ruled shape unsafe, the builder STOPS and reports: that is a plan
  defect, not a licence to switch silently.**
- **Acceptance.** Adding a kid **with** a photo stores it (bucket `kid-photos`) and it renders;
  adding one **without** is unaffected; the row's write still validates as today; the photo is
  never attached to a kid row that does not exist — **and the converse: a row written at
  photo-confirm time stays saved, Continue does not write it twice, and removing it removes the
  REAL row** (`removeKidRow` today only drops local state, which would leak a kid the parent
  believed they deleted).
- **Verify.** `npm run verify`.
- **Depends on.** 1b. **Budget.** medium — the ordering is the whole risk.

### Slice 4 — a map on the area card

> **SCOPE EXTENDED 2026-09-30 — plan defect #30, found by the builder's own measurement and ruled by the orchestrator.** `src/components/PlaceMap.tsx` joins this slice's files, **`PlacesMap`'s mount effect only**. `PlacePickerMap` is untouched: its callers always pass at least one place, and touching it would be the sweep-beyond-the-need this batch has ruled against twice.
> **Why this is a defect fix and not scope creep:** `PlacesMap` already contradicts its own contract. Its render path early-returns only when **both** entries and `homePin` are empty, and its own doc says *"the home pin itself is what is being shown"* — but its mount guard returns early when `markers.length === 0`, so a pin-only mount created **no Leaflet instance at all** and the card rendered a blank bordered box. The ruled shape (home pin + radius circle, empty `places`) was therefore **unsatisfiable in scope**.
> **Conditions:** prove every marker-dependent effect and derivation is correct with an empty array and a populated `homePin` — **the guard is not the only reader of `markers`**; confirm the radius circle actually paints once the instance exists, and that `HOME_PIN_ZOOM` is *right* rather than merely not-throwing; re-run `places-map-view` **and** every spec that mounts a `PlacesMap`; and the card's own proof must assert the `.leaflet-container`, the pin and the circle exist, because **a blank bordered box passes "no error" today.**
> **Ruled OUT, and recorded as a deferred PRODUCT question rather than acted on:** feeding the gazetteer's nearby places into this map. The area card answers "where do I live, and how far will you look"; the tour card owns what is out there.

- **Objective.** The radius stops being an abstraction.
- **Files.** `src/pages/OnboardingPage.tsx`; `src/components/PlaceMapLazy.tsx` (the LAZY wrapper —
  `leaflet` is already a dependency, `package.json:31`); `src/components/PlacesMapView.tsx` for its
  existing pure `shouldRenderPlacesMap`; `src/lib/geocode.ts` only if the seam needs a parameter.
- **Approach.** ⚠️ **PLAN DEFECT #29, found by grounding: as written, this slice renders a map
  nobody can see.** Measured — the address resolves **only inside `handleAreaFinish`**
  (`OnboardingPage.tsx:419`; its `onPrimary` is `:790` and the sole `zipFromAddressQueryBounded`
  call is `:441` — that function was DELETED by V28 r2 slice 8a, measured at `8d1170d`: zero
  production callers, and the card calls `locationFromAddressQueryBounded`), and that handler's
  success leg calls `saveLocation` (`:464`), which flips
  `homeZipSet` and renders the run's FINISH CARD **in place**. So "once an address resolves" is
  precisely the instant the card stops existing.
  **Ruled: the address resolves EARLIER — on blur, debounced — through the injected `AddressLookup`
  seam** (`src/lib/geocode.ts:45`; `geocodeAddress` `:88`, with the pure `zipFromResult` `:130` and
  `coordinatesFromResult` `:73`), **so ONE Nominatim request yields BOTH the zip and the pin.**
  `handleAreaFinish` then reuses the already-resolved result and must **never re-geocode** (the
  injected seam is also what makes the call count assertable in a test). Render through the LAZY
  wrapper, and reuse `shouldRenderPlacesMap` (`src/components/PlacesMapView.tsx`) as the render
  condition rather than inventing one. **The pending-state rule applies (r1's standing invariant):**
  the early lookup is bounded by the existing `ADDRESS_LOOKUP_TIMEOUT_MS`, and the ZIP fallback must
  keep working — the map must **never** be the thing that traps a parent.
- **Acceptance.** With a resolved address: a map with a home pin and a radius circle; changing the
  radius redraws it **with no new request**; an unresolved or failed lookup still leaves Finish
  reachable by ZIP; no map-shaped claim is rendered before the address resolves; **and exactly ONE
  Nominatim request per distinct address** — demonstrable by counting calls into the injected
  `AddressLookup` seam.
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
  **Measured, so the card describes the app that actually exists:** the four tabs are **Drop Ins**
  (`/`), **Inbox** (`/inbox`), **Places** (`/browse`), **Profile** (`/profile`) — and the centre
  control is **`<PostActionButton />`, an ACTION, not a fifth tab** (`App.tsx:486-506`; V24 slice 05
  deliberately reversed V22 slice 12 and the founder overruled the Apple-HIG objection on
  2026-09-25, with the comment reading **“Do NOT ‘fix’ the nav back to the V22 shape”** — so the
  tour describes it as posting, never as a tab). **The nav does not render during the run at all**
  (`navRenders`: signed-in AND not the first run) — which is exactly why this card is the bridge:
  the parent meets the four tabs for the first time when this card's CTA fires.
  **The orphan set is a CHAIN, measured:** `placeHasHours`'s only production caller is *inside*
  `finishRunPlaces` (`places.ts:1698`), so deleting the selection orphans it **second-order**, and
  `FINISH_RUN_PLACE_LIMIT` (`:1657`) is then left with only `places.test.ts`. **Not orphans — keep:**
  `placeKindLabel` and `formatDistanceLabel` have real consumers on `PlacePage` /
  `PlaceDetailsPage`. Both named capabilities live in the **Profile** tab — the name search
  (`ProfilePage.tsx:362`) and the parent-card link control — so the Profile line carries both, and
  per r2-D5 the card only *names* linking; that flow is unchanged.
- **Acceptance.** The ending shows the four tabs + the `+`, one line each, plus a line naming
  **finding a parent by name** and **linking a partner**, and a CTA into the feed; **no claim
  about places anywhere on it**; and **every line describes what the tab DOES, never what is IN
  it** — with fact 12 measured (zero upcoming drop-ins, one ZIP), a line promising content would be
  the fourth instance of this batch's honesty class; every export it orphaned is either still
  called somewhere or deleted with its test; `RadiusEmptyState` still has a reachable render path.
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
  - `rg "of 5" src/` — **32 hits, of which only 21 are the label.** 10 are star ratings
    (`reviews.ts`, `reviews.test.ts`, `PlaceDirectory.tsx`, `PlaceDetailsPage.tsx`) and 1 is an
    unrelated live-data note (`InboxPage.tsx:607`).
  - `rg "hasPhoto" src/` — `src/lib/places.ts:1070` has an **unrelated local of the same name**
    (a *place's* photo).

  The checkable rule: **a zero-hit claim must not match in a file the document never mentions.**
  ⚠️ **AND THE MECHANISM AS FIRST WRITTEN WOULD FIRE ON ITS OWN DOCUMENTATION — measured.**
  "Extract every acceptance grep line from `plan.md` and the briefs" fails, because those docs
  **quote the bad greps as defects**: `plan.md:241` ("⚠️ A blanket `rg "of 5" src/` is NOT
  [scoped]"), `plan.md:302` ("Measured today, `rg -n "middle name" src/` matches three files"),
  `.scratch/v28/briefs/slice-2.md:49` ("That criterion is itself a defect") and
  `explore-r2-restructure.md:65`. **A prose parser that cannot tell a CLAIM from a QUOTATION of a
  bad claim fires on the brief that exists to explain the defect** — which is the difference between
  a guard and a nuisance. **Ruled: the guard reads TAGGED claims only** (an explicit convention it
  documents in its own header, e.g. `ACCEPTANCE-GREP:`), with the real claims in `plan.md` and the
  slice briefs retrofitted — **plus a purely syntactic second rule that IS the defect class: a
  zero-hit claim's scope must name a path, not a bare directory.** Both deterministic; a prose
  parser is not.
  **Home: `scripts/guards/`, NOT `scripts/`** — because a guard absent from `run-all.sh`'s
  hard-coded list does not run at all, as that file says itself: *"a guard that does not exist
  cannot guard."* Register it in the `for guard in …` loop **and** its `.check.mjs` in the
  `run_check` block. **The `.check.mjs` uses the two real defects above as fixtures** — the pre-fix
  text is in this repo's history, so the guard can be run against the state that produced it, which
  is this project's standing guard rule. Name it `.check.mjs`, **never `.test.mjs`**: `npm test`
  discovers `*.test.mjs` and a top-level `process.exit()` inside vitest kills the run — the reason is
  written in `run-all.sh`, and it is load-bearing.
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

### Slice 8 — hygiene (r1's deferred 7c), SPLIT IN TWO because it outgrew one builder context

**Measured: this slice accumulated ELEVEN distinct workstreams** — five dead symbols, a four-site
stale-claim sweep, a 65-file newline sweep plus a guard, a duplicated comment, two refactors, two
spec-hygiene fixes, a route-abort spec, and a diff tool. **The slice-sizing rule is explicit: if a
slice cannot plausibly finish in one builder context, split it** — and this one cannot.

**Split by INDEPENDENCE, not by size.** That is the lesson of 1a/1b, where a token-budget split
turned out to be type-coupled and had to be re-ruled into one slice in two parts. These two share no
files and neither blocks the other:

- **8a — make the code and the record honest** (source + spec hygiene, one context): the
  wire-or-delete list, the stale-claim sweep, `resolveCard`, `ProfilePage.tsx:1218`, the
  `finishSignup` pre-resolved-zip option, `e2e/auth.setup.ts`'s duplicated walk.
- **8b — mechanical determinism and test honesty**: the trailing-newline sweep **then** its guard
  (that order, or the guard cannot go green), the duplicated `releaseUpload` comment, the redundant
  `Uploading…` assertion, the route-abort spec pinning the failed-upload path, and
  `scripts/slice-diff.sh`.

Neither is urgent: both touch files slices 3–6 rewrite, so they run last either way.

Its items touch the same files this revision rewrites, so running it earlier would mean doing
part of it twice.

**Wire-or-delete** (fact 11's class — a deletion leaves orphans): `missingProfileItems` /
`MissingProfileItem` / `needsOnboarding` (**0 production callers each**), **plus two the three
review lanes found in slice 1** — `hasAvatarUrl` (`src/lib/avatarUrl.ts:19`; zero non-test
consumers at `525fdcf`, because `App.tsx` and `OnboardingPage.tsx` both dropped their imports —
**slice 2 gets first refusal, since the name card's photo control may legitimately consume it**),
and **`restHeaders` in `e2e/onboarding-resume.e2e.ts:109`** — write-only headers
(`Content-Type`, `Prefer: return=representation`) whose only writer, the avatar-seed PATCH, slice
1b deleted. **Only the second is attributable to this batch**; the rule it teaches is worth more
than the fix: **the slice that deletes something owns what it orphans.**

**The phrase-based stale-claim sweep** — slice 1b's builder found three members and reported rather
than silently fixing them: `e2e/no-zip-notice.e2e.ts:24` ("stops BEFORE the photo and area
cards"), `e2e/avatar.e2e.ts:4` ("the onboarding 'Add a photo' step"), and the nudge-banner comment
that still says the kids/area cards "do not exist yet", which shipped in slices 4/5. **Name the
claim, not just the line: the plan first wrote that last one as `App.tsx:93` and measurement puts
the text at `:87`** — the same drift that made the slice-2 brief wrong twice.

**Trailing newlines — measured three times, now a systematic class, so the ruling changes.** `ocr`
flagged one; a sweep found **seven of the twelve** files slice 1b touched (all already missing it at
`e252f01`, so not 1b's doing). Then slice 2's **fix round created two brand-new lib files and omitted
it in both** (`src/lib/photoUpload.ts`, `src/lib/photoUpload.test.ts` — verified, last bytes `}` and
`)`). **Measured repo-wide: 65 tracked `src/`+`e2e/` files.**
**The pattern is the point: this is not randomness, it is how files get written here, so it will
keep recurring and a third one-off fix is the wrong answer.** **RULED — both halves, in this order,
inside slice 8:**
1. **A whitespace-only sweep in its OWN commit** (65 files, the marker-sweep precedent — the same
   7b job removed 1287 rows in one isolated commit). Whitespace-only, no semantic change.
2. **Then a full-repo `trailing-newline-guard` + its `.check.mjs`**, which can only be green after
the sweep — and which removes the need for the diff-scoping or allowlisting that a guard-before-sweep
would have forced. **The earlier ruling about WHERE still stands: never inside a product slice.** A
65-file rewrite bundled into a feature diff is the blanket-sweep defect this batch has hit four times
(`of 5`, `hasPhoto`, `middle name`, and now this).

**`e2e/name-card-photo.e2e.ts:155-161`** — the `releaseUpload` comment paragraph is **duplicated
verbatim** (two consecutive blocks opening "`releaseUpload` starts as a no-op…"), an edit leftover
from the fix round. Cosmetic; sweeps here.

Also here: extract `resolveCard(facts, skippedCards)`; `ProfilePage.tsx:1218`'s missing empty-string
clause; the `finishSignup` pre-resolved-zip option; remove `e2e/auth.setup.ts`'s duplicated walk.
- **Verify.** `npm run verify`. **Depends on.** 1b–6.

---

## 7. After this batch — explicitly NOT this batch

The three reviewing agents (research, product, Hermes) converged on one flag, and it is recorded
here **rather than turned into scope**:

- **The tour card will say "Drop Ins — what's happening near you," and with fact 12 measured that
  promise is thin**: zero upcoming drop-ins, all of them in one ZIP. The line describes what the
  *tab does*, not what is *in it* — which is exactly why slice 5's acceptance forbids a claim about
  places. **The promise is not a lie; the product behind it is empty**, and no amount of onboarding
  polish fixes that.
- **The agreed post-batch question is a person, not plumbing:** who plants the second ZIP — in
  practice, recruiting parents outside 98103. **Deliberately not a growth project inside r2.**
- **Watch item for the human walk — do not reword blind:** "search a parent by name" is truthful on
  the tour card, but to a nervous parent it may read as the surveillance-y direction of the
  feature. **Ask the human explicitly and watch for a flinch.** That answer decides whether it gets
  softened, and guessing at it now would be exactly the kind of unmeasured change this batch has
  spent its budget learning to avoid.

### The batch-closing human gate (not a builder slice)

Two pushes came back from the review. Both accepted:

1. **The sending domain: start it in parallel — but measurement says it does NOT gate the invite
   batch.** The agents called it a NOW decision; I went and checked, and
   `docs/email-fallback-ops.md:237` records a **founder ruling (2026-09-26) that the domain is no
   longer a blocker** — true *for mail to existing users*, and silent on a partner invite, the
   first message to someone who has never heard of Drop In (cold delivery, where a shared Gmail
   identity is weakest). **So the invite batch can ship on Gmail SMTP at beta volume — real mail,
   real inbox, not spam, is already proven — while the domain is nonetheless the longest lead-time
   item involved (register → DNS → SPF/DKIM → warm-up), which is the argument for starting it now
   rather than when it is needed.** The ruling has been amended in place so the next reader is not
   misled the way three agents were.
2. **r2-D1 must be closed by a human before this merges.** The resume fix has two non-vacuous e2e
   tests and **no human confirmation** — the playtest walked the happy path. **Two minutes closes
   the batch's biggest open verification item instead of carrying it forward.** Per the agents, the
   human should **bounce out of an already-finished profile first**: clause (b) of the resume rule is
   the half e2e cannot feel.

## 8. Risks / open questions

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

## 9. Status log (orchestrator appends after every phase transition)

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

### Slice 1 (pair 1a + 1b) — CLOSED, all three lanes in

- **Verifier: VERIFIED PASS.** `npm run verify` exit 0; 66 files / 1988 tests / 0 lint errors /
  81 warnings — an exact baseline match on all four numbers; every guard passes and the
  `no-bypass` flake did not reproduce. Browser lane **14 passed, 0 failed, 0 flaky, 0 retried**
  across the five named specs + setup. It verified at `ce77c80` rather than the brief's `525fdcf`
  and **proved the difference inert** (six planning files, no source touched) — better than the
  brief asked for.
- **Reviewer: PASS**, no code change required, five non-blocking findings, each adjudicated below.
- **`ocr`: 4 findings, all `low`, no rule violations.** Three are **pre-existing**, verified against
  `e252f01`: the missing trailing newline (7 of the twelve files — all already missing it; **74 of
  289 tracked source files repo-wide**) and two JSDoc rewrap strandings. **One is attributable to
  1b**, non-blocking: `restHeaders`' write-only headers lost their only writer when the avatar-seed
  PATCH was deleted.
- **RULING (F1 — recorded so it is not re-litigated):** the `hasPhoto` "0 hits" criterion is **too
  strict and is OVERRULED — comments that describe a removal are EXEMPT.** A zero-hit grep that
  forbids the sentence explaining the deletion punishes good documentation. The builder's judgment
  stands.
- **F2 accepted** (`FinishRunCard.tsx:27` — a doc comment *this slice* made stale; the slice that
  breaks a claim owns it). **F5 closed** by the verifier lane. **F3/F4 assigned to slice 8**, and
  the plan's own `App.tsx:93` was drift — the text sits at `:87`.
- **The reviewer's honesty check caught a report inaccuracy worth keeping:** 1b's Risk 3 says it
  fixed "the photo word" on the nudge docblock; the diff shows a *different* comment
  (`App.tsx:152`). The judgment was right, the description was not — which is exactly why the claim
  is checked against the diff instead of believed.
- **Slice 1 is CLOSED. Slice 2 dispatched.**

### Slice 2 — CLOSED (fix round 1), and the machine lane had one refuted finding

### Slice 6c — CLOSED 2026-10-02 (the slice that taught the batch its defect class)

### UNASSIGNED ACROSS ALL THREE 8b BRIEF VARIANTS — `useCropStep`'s await guard

Slice 8b's builder read all three brief variants (`slice-8b.md`, `slice-8b-2.md`, `slice-8b-3.md`) and reports that **§6's `useCropStep` await guard appears in none of them** — it is in 8b's items 1–2, not in 8b-2, not in 8b-3. So it was **not built**, and `onConfirm` at `src/components/useCropStep.tsx:27` is still live. **Recorded here because a brief item that belongs to no slice is one that quietly does not happen** — the same failure mode as an unowned deferral. It needs an owner (8c or 8d) once their briefs are read, and the reason a brief has three variants for one slice needs answering too.

### Slice 8a — CLOSED 2026-10-02 (source + spec hygiene, and the guard rule's failure)

**Product work, verified across five rounds:** the wire-or-delete list resolved (with `hasAvatarUrl` **wired** rather than deleted, slice 2 getting first refusal), the `finishSignup` stub's address intercept **given a tripwire and its written zip PINNED** — the mutation proving it: with the stub answering a *different seeded* zip the walk completes and the pin fails (`Expected 98107 / Received …Near 98104 · within 5 miles`). The `hasAvatarUrl` **call** is pinned by source-level legs that a faithful restatement fails. Gate green: 71 files / 2063 tests / 81 warnings / 0 errors.

**The guard rule it added is the cautionary tale.** Added mid-slice to retire a fabricated transcript *structurally*, it worked — the rule **fired on the live defect before the deletion**. Then round 4 closed two real holes and **created a reachable escape**: exempting quotation-introduced labels to stop the tripwire firing on its own repo meant a fabricator reaches a pass by **prefixing `>`** (`0 raw-labelled block(s) read … NOTHING was checked`, exit 0). It also **lost coverage** — three genuine raw blocks stopped being read.

**Round-5 verification FAILED and review returned NEEDS_CHANGES, both solely on that rule.** The breaker (**D-031**) adjudicated those internals to **8b**, which owns guards: *a repair that trades a small hole for a reachable escape is a net regression, and a sixth patch inside a product slice would be a third attempt at the same rule in three rounds.* The rule's two real fixes are kept; its escape, coverage loss and claims are **8b's, enumerated, to be fixed**.


The `transcript-summary-agrees` rule 8a added has a **reachable escape** (a quotation exemption a fabricator reaches by prefixing `>` — measured PASS exit 0 with "NOTHING was checked"), **coverage loss** (the narrowed label form dropped three genuine raw-labelled blocks), an **unwatched exempt set**, several **false claims**, an **unreproduced number**, and a **missing mutation**. All enumerated in `factory/work/v28-r2-8b.json`. **8b fixes them** — the breaker's method ruling is to take the rule back to its last reviewed-good form where that is simpler than a fourth condition, because a repair that trades a small hole for a reachable escape is a net regression.

### A SECOND 8b DEFERRAL — `factory-guard`'s report/brief scan passes on zero files

When no `.scratch/v28/reports`/`briefs` exists under the root it returns `reportFiles: 0`, prints "unchecked here", and **PASSES** — the same `checked=0` shape. Found by 8a's round-3 review and registered here and in `factory/work/v28-r2-8b.json` for the same reason the first one was: **an unowned deferral is a lost one.**

### DEFERRAL REGISTERED FOR 8b — `lib-sibling-guard.sh` passes at `checked=0`

A guard that reports health while checking **zero** files. Found by slice 8a's round-2 review, **declared in that slice but owned nowhere** — which is why it is written here and in `factory/work/v28-r2-8b.json` rather than left to memory. This is D-030's own class inside the guard suite, and 8b owns guards: it must **fail when it checks nothing**, with a seed and a mutation proving it.

### Slice 6d — CLOSED 2026-10-02 (the repo-wide honesty guard, and where the climb stops)

**Shipped:** `copy-taxonomy-guard.mjs` — 4 rules (a declared category must EXIST, be OFFERED, be BACKED by the
words, and the words must name NOTHING UNDECLARED), **29 checks / 26 invocations / 8 mutations**, every rule
paired with a mutation proving it can fail. Plus the declaration it reads, and the rule written into
`code-structure.md` first.

**Two ceilings declared rather than overclaimed:** Tier 2 (live counts) is **unbuilt** — a live count in the gate
adds a live dependency and a committed dated report rots with the suite green, so *an instrument that cannot run
in the gate must not be claimed by the gate*; and the unscanned copy is **reported with file:line, not fixed**.

**Five rounds, every fix measured.** Round 1: the guard's own header named *"an instrument that matches nothing
looks exactly like a clean repo"* and its implementation committed it — a zero-word scan returned PASS. Round 2:
the repair **repeated the class one level down** (a tripwire on the whole scan set, none on the DECLARED set rule
3 actually tests) and its new check **pinned that bad exit green**. Round 3: two orphaned arrays the diff itself
created. Round 4: the boundary list's specifics were wrong. Round 5: **the shrink introduced a falsehood by
over-coarsening.** Mechanism declared clean by the final review.

**D-030** came out of it — *an empty measurement read as a clean result* — and its instances span the factory:
the scheduler admitting an unprobeable machine (D-022), the sha resolver condemning every sha when git is absent
(D-024), and this guard twice. **§14's boundary shrank 1615 → 1451 words by deletion**, and the final pass added
**no new section** — because every earlier round's self-describing section became the next round's finding.


**Behaviour was verified correct every round; every failure for eleven rounds was PROSE ABOUT the
mechanism.** Ten instances of one class: *a claim the mechanism does not support* — a docstring count, a
bare-`HEAD` label, an `@{…}` alternative that had been deleted, "the only git call is `cat-file`" against a
real `git ls-files`, and finally a wrong number written while fixing wrong claims.

**Two human rulings came out of it.** **D-021:** make the reporting form *decidable* — a count's provenance
must name a commit sha, and the sha is verified with `git cat-file -e <sha>^{commit}`. **D-026:** build the
machine check. It did: four rules, **7 findings on its first run**, including two a human sweep had missed —
and its limit is declared with its number (**11 fresh instances constructed, 11 escaped**) rather than
overclaimed. **D-028** is the terminal method: where a claim cannot be kept true, **delete it, do not restate
it** — measured as a shrink (header 1289→1199, corrected report sections 3224→3108).

**Closed on:** mechanism PASS across repeated lane verdicts, gate green (71 files / 2067 tests / 81
warnings / 0 errors / GUARDS PASS), and the prose reduced by deletion. **Recorded deviation:** the terminal
deletion pass was closed on the orchestrator's own comment-only diff verification plus a green gate, not a
fresh reviewer verdict — an eleventh review of a comment-only diff would have extended the regress the slice
had just spent eleven rounds measuring. **Slice 6d is dispatched.**


- **Verifier: PASS twice.** Slice gate `npm run verify` exit 0 (66 files / 1988 tests) and fix gate
  exit 0 (**67 files / 1993 tests** — the +1/+5 predicted exactly), 0 lint errors / 81 warnings; the
  pinning spec and all four blast-radius specs green with **no timeouts**, which is what cleared the
  risk that the new `Continue` gate could dead-disable the no-photo walk.
- **Reviewer: PASS twice** — zero defects in the slice diff, and the fix round answered my sharpest
  question (does the escape *move* the defect?) **with proof rather than agreement**: the gate opens,
  the error surfaces as a real `role="alert"` line, the loss is recoverable in `ProfilePage`, and the
  alternative is the wall the pending-state rule forbids.
- **`ocr`: one REAL defect found (the in-flight race) and fixed; one `critical` REFUTED BY
  MEASUREMENT; one `high` deferred; three cosmetic/hardening items to 8b.**
  - The refutation: `ocr` claimed the spec held the wrong HTTP verb. Measured in the installed SDK —
    `uploadOrUpdate("POST", …)` is `upload()` (`index.mjs:717`) and `("PUT", …)` is `update()`
    (`:901`). **`upload()` sends POST, the spec is right**, and its four green runs are explained.
  - The deferral: an unproven claim that Enter could bypass the disabled button. **Right about the
    design point regardless — gating a form submission by disabling a button is fragile; the handler
    is the true entry point.** Goes to 8b with an assertion that the guard can fire, which *measures*
    the browser behaviour instead of arguing about it.

**Slice 3 is dispatched.** Slice 8b additionally inherits: the Enter guard + its assertion, the
route-abort spec for the failed-upload path, the un-cleared `escapeTimer`, the duplicated comment,
the redundant `Uploading…` assertion, and `scripts/slice-diff.sh`.

## PROCESS RULE — shell commands that cannot match themselves (added 2026-09-30 after two occurrences in one day)

**Every brief dispatched from here on carries this, and builders are expected to follow it without being told.**

- **`pgrep -f "<pattern>"` matches the SHELL THAT IS RUNNING IT**, because the pattern appears in that
  shell's own argv. **Use the bracket trick so the pattern cannot match itself:** `pgrep -f "[p]laywright test"`.
- **Do not poll for a background job.** Run it in the **foreground** and read the tail; or start it, keep
  the **PID**, and `wait $PID`. **A poll loop watching for its own pattern is an infinite loop wearing
  patience as a costume** — it does not fail, it does not finish, it just burns the run's clock until
  something kills it. One builder lost four minutes to exactly this and had to be interrupted.
- **Never pipe a counting loop through a pager** (`\| head`) — the pager exits, the pipe closes, SIGPIPE
  kills the loop, **and the count you print is a property of your display choice, not of the tree.** A
  count of 8 where the truth was 79 was produced this way.
- **Never pass `-r` to `rg`.** `-r` is `--replace`; rg will reprint every match as your replacement string
  **and the result looks like real code.** This has happened twice.

**The one idea behind all four: make the instrument incapable of matching the thing it is measuring.**
Every one of these mistakes produced a plausible, wrong number that looked like a finding.

## RECORDED ITEMS WITH NAMED OWNERS (added 2026-09-30 — the fix-round-1 reviewer's finding, and it was right to insist)

**The reviewer's words: an unowned deferral is a deferral by the batch's own rule.** Every one of these now
has a home rather than a hope.

| Item | Found by | Owner | State |
|---|---|---|---|
| **A rejected lookup poisons its slot until the address is edited** — a re-blur reuses the rejected promise, so the ZIP fallback persists even if the network recovered. **Not an invariant break** (the reviewer showed a republish could not fix it, since republishing `absent` is still null); a UX residual, and the fallback still lets the parent proceed. | slice-4 review | **8a** | recorded, not fixed |
| **A typed-zip mid-save race** — `homeZip` is captured at tap (`OnboardingPage.tsx:935`) and the zip input is NOT disabled during `await saveLocation`, which is a network write, so the field can move mid-write. **Same class as the address claims, different field, far smaller window** (the invariant is about the area card's resolution claims). Found by the slice-4 fix-round-2 reviewer. | slice-4 review | **8a** | recorded, not fixed |
| **A Finish tap inside the debounce window, then an edit, saves the OLD address's zip** — a suppressed settle still returns the result value to its caller. Breaks the invariant the slice documents (*"the card's map was already showing what this save will write"*) on the SAVE path after the DISPLAY path was fixed. | slice-4 fix-round-1 review | **slice 4 fix round 2** | IN FLIGHT |
| The reuse-branch comment is true only under an unstated condition (slot consistency + the edit clearing the slot). | slice-4 fix-round-1 review | **slice 4 fix round 2**, with the condition stated | IN FLIGHT |
| The kid-photo spec's flake windows, its missing status checks, its vacuous-if-`before===null` redraw assertion, and the spec-header overstatement. | slices 3 reviews | **8c** | brief pending |
| The newline sweep + its guard, `slice-diff.sh`, the await guard, the `\| void` drop. | r2 planning | **8b** | briefed |
| **The typed-zip field's own claim family** — (a) an invalid typed zip becomes INVISIBLE once the fallback note hides, so `handleAreaFinish` can set the error and return with **no visible feedback** (Finish silently no-ops); (b) `homeZip` is captured at tap and the zip input is not disabled during `await saveLocation`, a network write. **Two instances, one field — and a card that silently does nothing is the wall class.** | slice-4 fix-round-3 review | **8d** (NEW — split out of 8a) | recorded, not fixed |
| **Turn the resolution-claims habit into a SITE**: one `invalidateResolutionClaims()` called by the edit handler, plus a lint rule banning those setters outside that function and the settle/reject legs. **The reviewer's honest finding is that the spec pin is a TEMPLATE for unknown future claims, not a guard; this is what would make it one** (a fully automatic guard is impossible while claims depend on async settles). | slice-4 fix-round-3 review | **8a** | recorded, needs its own brief slot |


**And one habit of mine, recorded where it will be read: I have now produced four numbers I did not obtain** —
two invented run ids, a computed test count (2014 for 2012), and a brief claim that a sibling test pinned
something it did not. **Every one was caught, and every one was caught by a lane rather than by me.** The
remedies that worked were structural, not resolutions: the run-id field is **deleted** from the ledger, counts
are stated as **checks** that a lane must confirm or name a difference for, and a claim about "the sibling test
already pins this" is now something a brief asserts only after grepping it.
