# Explorer brief — the first-run RESTRUCTURE (read-only, cited findings)

You are `orchestrator-explorer`. **Edit nothing. Create no files. Commit nothing.**
Report cited findings only: every claim carries `path:line`. A claim without a line
reference is not a finding, it is a guess — and a guess that reaches a plan becomes a
defect that reaches a builder.

Repo: this worktree (`/home/jmeisburg/orca/workspaces/playdate-app/onboarding`),
branch `Meisburg/onboarding`. Read `docs/agents/code-structure.md` first (the build law).

## Why (the human's playtest feedback, verbatim in substance)

The V28 first run is built and verified: `account → name → kids → photo → area → finish`.
The human walked it on a phone and now wants a **restructure**:

1. The standalone **photo card goes away** — a parent photo belongs on the **name card**.
2. The **kids card** gains an **optional kid photo**.
3. The **area card** gains a **MAP**, so "5 miles" means something.
4. The **finish card's "pick a place" list goes away**, replaced by a **"How Drop In
   works" card** explaining the four tabs (Drop Ins / + / Places / Inbox).
   New shape: `account → name(+photo) → kids(+kid photo) → area(+map) → how-it-works`.
5. Two **copy defects** the human found by reading the screen:
   - a taken display name advises *"try adding a middle name or initial"* and no such
     field exists;
   - the name card says "A first name is plenty" directly above a Last name field.

## What to find and report

**For each: the exact current shape, every caller/consumer, and line references.**

1. **`src/lib/firstRun.ts`** — the FULL current surface: `FirstRunCardId`,
   `FIRST_RUN_CARDS`, `FirstRunFacts`, `isSkippable`, `nextUnfinishedCard`,
   `progressLabel`, and every export's consumers (source AND test AND e2e). I need to
   know exactly what changes when `'photo'` leaves the card list and the denominator
   goes 5 → 4.
2. **`src/lib/firstRunCopy.ts`** — its shape (per-card `title`/`body`/`skipLabel`?), which
   entries are actually rendered by which card, and which are **pinned by a test but read
   by nobody** (a known pattern in this repo). Report the copy for the name and photo
   cards verbatim with line refs.
3. **The PARENT PHOTO path** — `uploadAvatar` (signature, in `src/lib/db.ts`), the crop
   step (`src/components/useCropStep.tsx`), whatever component renders the "Add a photo"
   control, and **exactly how `src/pages/ProfilePage.tsx` wires them together** (line
   refs). I need the smallest reuse surface. Also `hasAvatarUrl` (`src/lib/avatarUrl.ts`)
   and its consumers.
4. **The KID PHOTO path** — `uploadKidPhoto`, `kidPhotoPath`, `kidPhotoStoredRef`,
   `useKidPhotoUrls` (signatures + files), and **how ProfilePage's kid editor** wires the
   upload/crop/display (line refs). Does it need a persisted kid row first (i.e. a
   `kidId` that only exists after `addKid`)? **This is the crux: can a kid photo be
   attached to a kid that has not been saved yet?**
5. **The MAP** — `src/components/PlaceMap.tsx`, `PlaceMapLazy.tsx`, `PlacesMapView.tsx`:
   each one's props, whether any takes a **center + radius** or can draw a radius circle,
   how lazy-loading works, and how `PlaceDirectory.tsx` uses them (line refs). Report
   whether reusing one on a small onboarding card is plausible and what it needs.
6. **`src/lib/places.ts`** — `finishRunPlaces`, `FINISH_RUN_PLACE_LIMIT`, `placeHasHours`,
   `FinishRunPlace` and **every consumer**, so I can judge whether the finish-card list
   becomes dead code when the list goes (the repo's "pinned by a test, read by nobody"
   pattern).
7. **`src/components/FinishRunCard.tsx`** — its full structure and props.
8. **`src/pages/OnboardingPage.tsx`** — the render sites and gates for the name, kids,
   photo and area cards, with line refs: `kidsCardDone`, `photoCardDone`,
   `hasAvatarUrl(...)`, `kidsFactPending`, the `first-run-*` testids, and how a card
   reports "done". Also how the card order is expressed.
9. **THE DENOMINATOR + SEQUENCE BLAST RADIUS — GREP, DO NOT LIST FROM MEMORY.**
   Run and report the actual output of:
   - `rg -n "of 5" src/ e2e/`
   - `rg -n "progressLabel|FIRST_RUN_CARDS|nextUnfinishedCard|isSkippable" src/ e2e/`
   - `rg -n "finishSignup" e2e/ | wc -l` and `rg -l "finishSignup" e2e/`
   - `rg -n "first-run-photo|first-run-name|first-run-kids|first-run-area|first-run-finish" e2e/ src/`
   - `rg -n "photoCardDone|kidsCardDone|hasAvatarUrl|isSkippable" src/`
   Report counts AND the file list. **Never grep a phrase that can wrap** — use the
   shortest stable fragment and read the surrounding context.

## Rules that bind this report

- **A no-match is a finding** — say "0 hits" explicitly rather than omitting it.
- **Do not use `-r` with `rg`** (it parses as `-r n` and FABRICATES output).
- If you cannot determine something, say so and name what you checked.
- Report the current state; **do not propose the fix.** I am writing the plan; you are
  giving me the ground truth it must be built on.
- Finish with a short section: **"Facts I could not establish"**.
