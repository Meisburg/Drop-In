# Fix round 1 — V28 Slice 3c (blocking finding, `0b0ad3d`)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

Your slice is good and two of its three parts are confirmed correct. One finding
**blocks**, and it is a fairness problem the batch exists to prevent: **the nudge
tells the parent what it is about to ask, and the app does not ask it.**

## The blocking finding

`src/App.tsx:190-193` renders `— {FIRST_RUN_COPY[card].title}`. Those titles
describe cards **that do not exist yet**:

| card | what the nudge says | what the landing actually shows |
|---|---|---|
| `kids` | "who's coming?" | the old page's optional kids field |
| `photo` | "add a photo" | the old page's optional photo field |
| `area` | "where do you live?" | the old page's "Set your location" step |
| `name` | "what should we call you?" | the card renders **"What’s your name?"** |

Slices 4 (kids, photo), 5 (area) and 6 (finish) are **unbuilt**, so the nudge names
questions the app will not ask. And `name` is named with **different words** than
the card uses.

## The root cause — measure it yourself before you fix it

**`FIRST_RUN_COPY` has exactly one consumer: your nudge.** No card reads it:

```
rg -n "FIRST_RUN_COPY" src/ --glob '!*.test.ts'
  src/App.tsx:16   import { FIRST_RUN_COPY } from './lib/firstRunCopy'
  src/App.tsx:174  const copy = card !== undefined ? FIRST_RUN_COPY[card] : null
  src/lib/firstRunCopy.ts:27  export const FIRST_RUN_COPY …
```

The cards hard-code their own titles — `OnboardingPage.tsx:347` is
`title="What’s your name?"` (note the **typographic** apostrophe; an ASCII `'` in
a search pattern finds nothing, which cost the orchestrator two false greps).
`progressLabel` from `firstRun.ts` *is* wired; `FIRST_RUN_COPY` is not.

**So the nudge is currently the only speaker of a copy module no card uses — a
second voice that has already drifted.** Do not fix that here (Slice 4 owns
wiring the cards to the module). **Your job is to stop the nudge from claiming
cards.**

## What to change

1. **The nudge's line becomes generic — no card title.** "Finish setting up" plus
   a card-agnostic body, and a generic action label. It must not name a card at
   all, because today it cannot honestly name one.
2. **Put that generic copy in `src/lib/firstRunCopy.ts`, with its test.** Copy
   belongs in the copy module, and Slice 4 will swap in card-specific titles as
   each card starts rendering. Keep the module's existing per-card `title`/`body`
   /`primaryLabel` entries **untouched** — Slice 4 reconciles them with the cards.
3. **Do not touch `FIRST_RUN_COPY`'s per-card wording.** No card reads it yet, and
   reconciling it against the rendered cards is Slice 4's named obligation.
4. **Reword this stale comment** — `src/pages/OnboardingPage.tsx:72`:
   "`suggestedHandle` itself keeps its email fallback — **other callers** and its
   tests pin it." There is **no other caller**; yours was the only production call
   site and it now passes `null`. Say "its tests pin it." (This batch has caught
   four stale "reads true" comments; this is the fourth.)
5. **One word:** `src/App.tsx:366` says "the resume nudge (slice **3b**)" — it is
   slice **3c**.

## Do NOT do these

- Do not build the kids, photo, area or finish cards (slices 4/5/6).
- Do not wire the cards to `FIRST_RUN_COPY` (Slice 4, with its own brief).
- **Do not chase the new lint warning.** One new `react(set-state-in-effect)` at
  `src/App.tsx:130` took the count 80 → 81. The reviewer ruled it **acceptable**
  (the repo carries 80 of that class and the effect is the right home for the
  async read) and the orchestrator **accepts it as recorded baseline movement**.
  Leave it; do not refactor to silence it.
- Do not touch anything the reviewer verified as correct: the
  `suggestedHandle(metadata, null)` call site, the `homeZipSet` early return and
  hard-coded `hasZip: false` (airtight — both it and `firstRun.ts` mean
  `hasHomeZip`), the `navRenders` mount, the sessionStorage dismissal, the
  `aria-live` announcement, or the `subscribePushArmed` seam.

## Verify

```
npm run verify
npx playwright test e2e/golden-path.e2e.ts
```

Paste real tails: **lint is expected at 81 warnings / 0 errors** (the accepted
new warning — do not remove it), tests at **65 files / 1975 tests or one higher if
you added a test for the new copy**. Say explicitly which of those two counts you
ended at.

## Report

```
Status: DONE | BLOCKED
Files changed: <path> <what and why>
The nudge now renders: <the exact generic line, quoted>
What I did NOT touch, and why: <FIRST_RUN_COPY's per-card wording; the lint warning>
Commands run: <real tails; the lint count and the test count, stated against 81/0 and 65 files/1975>
Gate green: yes | no
Commit: <sha>
```
