# Slice 4a — The kids card, and the cards start reading the copy module

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

Read `plan.md` → **Slice 4a** (I split Slice 4 — read it fresh), then
`docs/agents/code-structure.md`. Slices 1–3c are done and verified; a new parent
signs up, lands in the interview, and the name card works.

Two jobs. **The second one is small but it is the fix for the batch's only
blocking review finding.**

## Job 1 — the kids card (card 3 of 5)

Collects kids (first name + age) with a working Skip; reads **`3 of 5`**.

**Measured facts — do not re-derive these, and do not trust a line number I give
you over the file in front of you:**
- `MAX_KIDS_PER_PROFILE = 5` (`src/lib/db.ts:2364`); `validateKid(firstName, age)`
  (`db.ts:2501`), `validateKidName` (`db.ts:2482`), `validateKidAge`
  (`db.ts:2490`); `addKid` already enforces the cap itself (`db.ts:2948-2949`) —
  note **blank-row skip** behaviour in `validateKid` and keep it.
- The existing kid logic in the page: `addKidRow` (`:204`), `removeKidRow`
  (`:214`), the save loop (`:270`), `kidsAtCap` (`:416`), and the UI (`:548-587`).
- **⚠️ THIS IS A REORDER, NOT A VERBATIM LIFT.** The page currently renders the
  **photo** block (~`:515`) **before** the kids block (~`:548`). The chosen card
  order is **kids then photo**. So the kids markup moves *ahead* of the photo
  markup — and Slice 4b then turns that photo block into its own card. Do not
  "clean up" the photo block: leave it working for 4b.
- Reuse the existing seams (`addKid`, `validateKid`, `MAX_KIDS_PER_PROFILE`); do
  not invent new validation.

**Acceptance:**
- The kids card accepts multiple kids (first name + age), enforces
  `MAX_KIDS_PER_PROFILE`, and reuses `validateKid` including the blank-row skip.
- A working **Skip** advances past the card writing nothing.
- A failure writing kids is surfaced and does **not** block Continue.
- The card reads **`3 of 5`** (via `progressLabel('kids')`).
- **`finishSignup` in `e2e/fixtures.ts` walks the new kids hop** — 18 spec files
  consume it. A slice that leaves the suite red is not done.

## Job 2 — ⚠️ THE CARDS START RENDERING FROM `FIRST_RUN_COPY` (defect #20's fix)

**Measured, and this is why the batch had its only blocking finding:**
`FIRST_RUN_COPY` (`src/lib/firstRunCopy.ts`) is **currently consumed by nothing in
the app.** Its only reader was the resume nudge, and the fix round removed that.
`rg -n "FIRST_RUN_COPY" src/ --glob '!*.test.ts'` returns **only its definition and
two comments.** Meanwhile the name card **hard-codes** its own words —
`OnboardingPage.tsx:348` is `title="What’s your name?"` (typographic apostrophe)
while the module says `"What should we call you?"`.

So there are **two sources of truth for one card, and they have already drifted.**
Wire them up:

- **Your kids card renders its title, body and primary label from
  `FIRST_RUN_COPY.kids`** — never a hard-coded string.
- **Reconcile the name card too**: make `OnboardingPage.tsx`'s name card render
  from `FIRST_RUN_COPY.name` and **delete its hard-coded `title`/`body`**. Decide
  which wording wins: the module's (`"What should we call you?"`, the tested
  artifact) or the card's (`"What's your name?"`, which parents currently see).
  **Either is fine — leaving both is not.** If you change the module, change its
  test in the same commit.
- The visible words may therefore change for the name card. **Say in your report
  which wording you chose and why.**

## ⚠️ Do NOT add the card's title to the resume nudge

The nudge stays **generic permanently** (ruling after defect #20): the generic line
is never wrong, and naming a card couples the shell to the card inventory — the
exact coupling that caused the blocking finding. `FIRST_RUN_COPY` is for the
**card**; the nudge speaks `FIRST_RUN_NUDGE_COPY`. Leave `src/App.tsx` alone
unless `finishSignup` or a failing test forces you to report something about it.

## Verify

```
npm run verify
npx playwright test e2e/golden-path.e2e.ts
```

Paste real tails. **State the lint count against 81 warnings / 0 errors** (the one
accepted warning is `react(set-state-in-effect)` in `App.tsx` — do not add a second
without saying so) and the test count against **65 files / 1978 tests**.

**⚠️ The golden path and `finishSignup` now walk a NEW hop.** If specs fail, the
flow changed — fix the helper's walk, and **report** rather than deleting or
loosening an assertion. `e2e/onboarding-gate.e2e.ts` pins the gate's `loading`
outcome: do not weaken it.

## Out of scope

The photo card and `useCropStep` (Slice 4b), `hasAvatarUrl` (4b), the area card
(5), the finish card (6), `src/App.tsx`'s nudge, `src/lib/firstRun.ts`,
`src/lib/firstRunCopy.ts`'s **other** cards' entries (only `name` and `kids`),
`e2e/**` beyond `fixtures.ts` **and `auth.setup.ts`** (see below), `plan.md`,
`task-state.md`, `.scratch/**`.

**⚠️ `e2e/auth.setup.ts` IS IN SCOPE BY NAME** — added after the builder surfaced
the ambiguity, which was exactly right. It **inlines** the name-card →
location-step walk by hand and does **not** use `finishSignup`, so the new kids
card breaks it and **every chromium spec goes red**. Add the **Skip tap after the
name card** — the same hop `finishSignup` gets — plus a comment saying why the hop
exists, so the next reader sees a sequence rather than a mystery tap. **Do NOT**
refactor it onto `finishSignup` in this slice: it onboards the marker with a zip
**and** a radius which the helper may not do, and folding a refactor into a
walk-fix makes any failure ambiguous (the same reasoning that split 4a from 4b).
**But answer in your report whether `finishSignup` could cheaply subsume it** —
`auth.setup.ts` has now broken **twice** on the same class of change, so Slice 7
needs that answer to decide whether the duplication gets removed.

## Commit and report

Scoped `git add`. Only when green:

```
V28 slice 4a: the kids card, and the cards start reading FIRST_RUN_COPY
```

Report:

```
Status: DONE | BLOCKED
Files changed: <path> <what and why>
Kids card: <what it reuses; how Skip and the cap behave>
Copy adoption: <which wording won for the name card, and why; what is now hard-coded (should be nothing)>
finishSignup: <what hop you added; which specs passed>
Commands run: <real tails; lint vs 81/0; tests vs 65 files/1978>
Gate green: yes | no
Commit: <sha>
Risks: <or "none">
Unresolved questions: <or "none">
```
