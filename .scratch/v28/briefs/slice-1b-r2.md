# Slice 1b — every call site and every stale "of 5" tells the truth

You are `orchestrator-builder`. **Read `docs/agents/code-structure.md` before writing anything.**
Worktree: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.
**Read `plan.md` section 6, slice 1b, and fact 3** — this brief is a pointer, not a replacement.

## Why this slice exists

Slice 1a already changed the pure model: `'photo'` is gone from `FirstRunCardId` and
`FIRST_RUN_CARDS`, so there are **four** cards and `progressLabel` emits `"N of 4"`. **This slice
makes the rest of the app agree with it** — the photo card is deleted from the page, and every
place that still says five stops saying it.

`src/lib/firstRun.ts` and `src/lib/firstRun.test.ts` are **slice 1a's files, already committed.
Do not edit them** — with exactly one exception, below.

## Files in scope

- `src/App.tsx` — the nudge passes `hasPhoto` into `nextUnfinishedCard` (`:167`; the comment at
  `:93` explains where the facts come from, and it names `hasPhoto` too); that fact no longer
  exists, so stop passing it
- `src/pages/OnboardingPage.tsx` — the photo card's gate (`:828`), its state (`photoCardDone`,
  `:237`), its JSX and testid `first-run-photo-card` (`:848`), the facts object that computes
  `hasPhoto` (`:300`), the two comments that describe `photoCardDone` (`:72`, `:233`), and the
  measured comment sweep (`:55,58,177,229,455,573,705,808,869`)
- `src/lib/avatarUrl.test.ts` — a comment that refers to "the … hasPhoto fact today" (`:7`)
- **`src/lib/firstRunCopy.ts` + `src/lib/firstRunCopy.test.ts`** — ⚠️ **added to this slice after
  1a's builder proved the slice cannot go green without them**, and I re-measured it myself.
  `FIRST_RUN_COPY` is typed `Record<FirstRunCardId, FirstRunCardCopy>` and still carries a `photo`
  entry (`firstRunCopy.ts:44`), read at `OnboardingPage.tsx:819,829`; `firstRunCopy.test.ts:29`
  reads `.photo.skipLabel`. Delete the `photo` entry and fix that test's card list.
  **Slice 2 owns the copy *wording*; you own the entry's removal** — a mechanical consequence of
  the model change. **Quote the deleted `photo` wording verbatim in your report**: slice 2 will
  want that sentence when it puts a photo control on the name card, and quoting it saves someone
  digging through git history for it.
- `src/pages/LoginPage.tsx` — comment sweep only (`:31,105,150,228`)
- `src/components/FirstRunCard.tsx` — doc comment (`:37`)
- `e2e/fixtures.ts` (`:337,341,389,390,391,435,439,449`), `e2e/auth.setup.ts`
  (`:21,30,66,83,103,111,119`), `e2e/onboarding-resume.e2e.ts` (`:6,14,36,81,93,94,179`),
  `e2e/signup-zip-fallback.e2e.ts` (`:10,61,81,92,101`)

**One carve-out:** if `src/lib/firstRun.ts:73`'s doc comment still reads `"2 of 5"`, change that
single comment to `"2 of 4"` — those lines are yours. The rest of the file is not.

## ⚠️ The trap: `of 5` is NOT one thing

There are **32** `of 5` hits in `src/` and only **21** are the label. **Changing the wrong ones is
a new defect, not a fix.**

**Not yours, ever:**
- `src/lib/reviews.ts:198`, `src/lib/reviews.test.ts:194,195,199,205,206`,
  `src/components/PlaceDirectory.tsx:1419,1425,1534`, `src/pages/PlaceDetailsPage.tsx:197`
  — these are **star ratings** ("4.3 out of 5"). Rewriting review copy would be a real bug.
- `src/pages/InboxPage.tsx:607` — an unrelated live-data measurement note.
- `src/lib/firstRun.test.ts:206` (`"const label = '2 of 5'"`) — a **fixture string fed to the
  purity scanner** to prove prose is out of scope. It looks exactly like the label. Leave it.

**Do not sweep by find-and-replace.** Read each hit and decide.

## What to do

1. Delete the photo card from `OnboardingPage.tsx`: the gate, the `photoCardDone` state, the JSX
   block, and the `first-run-photo-card` testid. The run goes `name → kids → area → ending`.
   **The photo block's *behaviour* is NOT deleted — slice 2 re-homes it onto the name card.**
   Delete the card's render, and leave a short comment saying the photo moves to the name card in
   slice 2, so the next builder is not left guessing whether something was lost.
2. Stop passing `hasPhoto` from `src/App.tsx:163`.
3. Reword every onboarding-progress `of 5` in the sweep list above. Keep the surrounding meaning —
   these comments describe which card is which, and the numbering is shifting under them.
4. Update the e2e specs so the walk matches four cards.
   ⚠️ **In `e2e/onboarding-resume.e2e.ts` the photo card IS the resume checkpoint** — `:91` and
   `:175` assert it becomes visible, `:132` and `:183` assert it is gone. Those four assertions
   must be **rewritten against a card that still exists**, not deleted: pick one of the remaining
   four and say in your report which you picked and why. Deleting them would quietly turn the
   resume tests into tests of nothing — which is exactly the vacuity class this repo has already
   been bitten by. `e2e/onboarding-resume.e2e.ts:28` and `:159` also carry comments naming
   `hasPhoto`; those are yours too.

## Acceptance criteria (each one checkable)

- `rg -n "of 5" src/pages/OnboardingPage.tsx src/pages/LoginPage.tsx src/components/FirstRunCard.tsx src/lib/firstRun.ts` → **0 hits**.
- `rg -n "first-run-photo-card" src/ e2e/` → **0 hits**.
- `hasPhoto` is gone from the first-run model and every one of its consumers: `rg -n "hasPhoto"
  src/App.tsx src/pages/OnboardingPage.tsx src/lib/avatarUrl.test.ts e2e/onboarding-resume.e2e.ts`
  → **0 hits**.
  ⚠️ **A blanket `rg "hasPhoto" src/` is NOT the check, and cannot be satisfied** —
  `src/lib/places.ts:1070` has an **unrelated local of the same name** (a *place's* photo, not a
  parent's; `:1071` returns null when it is absent). Renaming it to make a grep pass would be
  vandalism. **This is the `of 5` trap again, one file over** — read each hit, do not sweep.
- `rg -n "of 5" src/lib/reviews.ts src/lib/reviews.test.ts src/components/PlaceDirectory.tsx src/pages/PlaceDetailsPage.tsx` → **unchanged hit count** (these must be *untouched*, prove it).
- The four-card walk passes end to end in the specs.
- **`e2e/fixtures.ts` is a per-slice obligation**: 17 spec files call `finishSignup`, so if the
  walk you change is shared, every one of them still walks four cards.

## Verification command

```
npm run verify
npx playwright test e2e/onboarding-resume.e2e.ts e2e/signup-zip-fallback.e2e.ts
```

⚠️ **`npm run verify` is RED at your base commit and closing it is your job.** Slice 1a removed
`'photo'` from the card union; **six `tsc` errors and one failing test remain, all of them in
files that are now in your scope.** The measured errors are: `App.tsx:167`, `OnboardingPage.tsx:300`,
`OnboardingPage.tsx:829`, `OnboardingPage.tsx:832`, `firstRunCopy.ts:44`, `firstRunCopy.test.ts:29`.

**This slice's gate is the pair 1a + 1b: `npm run verify` must exit 0 when you are done.** Report
both **exit codes** and the **test counts** verbatim (baseline: 66 test files / 1989 tests, 0 lint
errors / 81 warnings — note 1a removed exactly one test, the deleted photo-card test, so 1988 is
the honest expectation). If a count moved for a reason outside this slice, say so.

## Budget

**Medium.** Wide but mechanical. If you find yourself redesigning the page, stop — that is slice
2's job, not yours.

## Report back

Structured: what changed, both verification output tails, the acceptance criteria **one by one**
with the grep output pasted, anything you could not satisfy, and **any fact in this brief you
found to be wrong** — a wrong brief is a finding, not your failure.

**And one mandatory field: `Committed as: <sha7>`** — or, if you did not commit, say so plainly
and say why. A missing commit is not a formality: **two builders in this batch have reported DONE
on an uncommitted tree** and the orchestrator had to commit their work by hand. Your report is
what tells me which world I am in.
