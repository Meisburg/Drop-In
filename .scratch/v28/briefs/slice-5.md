# Slice 5 — the "How Drop In works" ending

You are `orchestrator-builder`. **Read `docs/agents/code-structure.md` before writing anything.**
Worktree: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.
**Read `plan.md` §6 slice 5** — this brief is a pointer with measurements.

## Why this slice exists (r2-D3 — a deliberate REVERSAL of an r1 decision)

r1 ended the run with a "places near you" list. **r2 replaces it with a tour**: the run's last card
teaches the app instead of listing parks. **This is the parent's first meeting with the nav** — the
nav does not render during the run at all (`App.tsx`, `navRenders`: signed-in AND not the first run,
so `/onboarding` renders the interview bare). This card is the bridge, and the CTA is the crossing.

## ⚠️ TWO LOAD-BEARING IDENTIFIERS — pinned, measured, do not drift

Measured by grep, and this is the same landmine class as the name card's `/^Continue/`:

- **`testId = 'first-run-finish-card'`** — asserted at `e2e/fixtures.ts:481`,
  `e2e/auth.setup.ts:134`, `e2e/signup-zip-fallback.e2e.ts:146,210`. **Keep it.**
- **`primaryLabel: 'Go to your feed'`** — located by `getByRole('button', { name: 'Go to your
  feed' })` at **`e2e/auth.setup.ts:135`** (that is EVERY spec's setup) and
  **`e2e/fixtures.ts:483`** (17 consumers), plus `signup-zip-fallback.e2e.ts:148,211`.

**If you change either, you must update all four call sites and say so loudly in your report.** The
copy does not need it — "Go to your feed" is a perfectly good CTA into the feed — so **prefer
keeping both.** A CTA rename here would break the shared setup of the entire e2e suite, which is an
absurd price for a wording change.

## What the tour must say (measured against the real nav)

**The four tabs are: Drop Ins (`/`), Inbox (`/inbox`), Places (`/browse`), Profile (`/profile`).**
**The centre control is `<PostActionButton />` — an ACTION, not a fifth tab.** `App.tsx:486-506`
records that V24 slice 05 deliberately reversed V22 slice 12, that the founder overruled the
Apple-HIG objection on 2026-09-25, and — in capitals — **"Do NOT 'fix' the nav back to the V22
shape."** So describe it as **posting a drop-in**, never as a tab.

**Both of the "hidden" capabilities live in the Profile tab**, so the Profile line carries both:
- **finding a parent by name** — `searchProfilesByName` (`db.ts:5972`), driven from
  `ProfilePage.tsx:362`
- **linking a partner** — the parent-card link control. **Per r2-D5 this card only *NAMES* it**;
  the linking flow itself is unchanged, no schema or policy work.

**⚠️ The honesty rule that governs every line (this batch's fourth instance if you get it wrong):**
**each line describes what the tab DOES, never what is IN it.** Measured on the live database
(fact 12): **zero** upcoming drop-ins, and all 20 existing ones are hosted from a single ZIP. So
"Drop Ins — what's happening near you" describes the *tab* and is fine; a line promising that
content *exists* would be false for every parent alive. **No claim about places anywhere on the
card** — that is the plan's acceptance, verbatim.

## What to remove, and the orphan CHAIN (measured)

Remove the places read and the picks list, then deal with what that orphans **by name**:

- **`finishRunPlaces`** — `places.ts:1684`; its only production caller is `OnboardingPage.tsx:320`.
- **⚠️ `placeHasHours` is a SECOND-ORDER orphan**: its only production caller is *inside*
  `finishRunPlaces` (`places.ts:1698`). Delete the selection and this loses its last caller too.
- **`FINISH_RUN_PLACE_LIMIT`** — `places.ts:1657`; after the above it is left with only
  `places.test.ts`.
- **`FinishRunPlace`** — `places.ts:1660`, and the page's state (`OnboardingPage.tsx:31,149`).
- **The page's whole read**: `listPlaces` (`:16`), `finishPicks` (`:149`), `finishPicksReadError`
  (`:150`), the effect around `:304-320`, and the `picksKey` logic at `:708-719`.
- **The list's own testids die with it**: `finish-run-places`, `finish-run-places-loading`.

**NOT orphans — do not delete:** `placeKindLabel` and `formatDistanceLabel` have real consumers on
`PlacePage` / `PlaceDetailsPage`. `places.test.ts` pins the four above (`:63,64,1251,1270`) — those
tests go with the functions, because **the plan's rule is never to leave a test pinning a function
nobody calls.**

**`RadiusEmptyState`** (`FinishRunCard.tsx:97`) loses *this* render site, but stays reachable —
measured consumers: `FeedPage.tsx:1272`, `PlaceDirectory.tsx:1117`. Verify that yourself before
claiming it.

## Acceptance (demonstrate each)

1. The ending shows the four tabs + the `+`, one line each, plus a line naming **finding a parent by
   name** and **linking a partner**, and a CTA into the feed.
2. **No claim about places anywhere on the card** — and every line describes what a tab DOES.
3. Every export the slice orphaned is either still called somewhere or **deleted with its test**.
4. `RadiusEmptyState` still has a reachable render path.
5. `first-run-finish-card` and the `Go to your feed` label still resolve (see the pinned list).
6. `npm run verify` exits 0.

## Verify

`npm run verify`. **Targeted e2e only — and these three matter most, because they ride the pinned
identifiers:** `e2e/auth.setup.ts` (via any spec), `e2e/signup-zip-fallback.e2e.ts`, and one
`finishSignup` consumer. Kill listeners **by port**, never `pkill -f`.

**Two known flakes — re-run once before reporting either:** `scripts/guards/no-bypass-guard`,
`e2e/places.e2e.ts:2759`. Note `e2e/places.e2e.ts` imports `placeKindLabel` from `places.ts`
(`:97`) — if you touch that module, that spec is your blast radius.

## Report format

- **Committed as: `<sha7>`** — or say plainly *"not committed"* and why; an absent field is read as
  evidence.
- Files changed with `+/-` counts.
- For each acceptance criterion: **the command and its raw output tail.**
- For criterion 3: the **wire-or-delete decision for each of the four symbols, by name**, and the
  `rg` output proving each is either called or gone.
- For criterion 5: the grep output for both identifiers, before and after.
- `npm run verify`: exit code, test-file count, test count, lint counts.
- Anything the plan did not anticipate — **say it rather than quietly fixing it.**
