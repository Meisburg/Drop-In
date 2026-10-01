# Slice 6c — one `escapeForRegExp`, and an honest statement of where that is impossible

*(One of four subjects slice 6 was split into. **6c is only the escape dedupe.**)*

You are `orchestrator-builder`. **Read `docs/agents/code-structure.md` before writing.** Worktree
`/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.

## Why this slice exists

Slice 5 single-sourced the escape for its own two callers and then **found the same one-liner elsewhere** — and
flagged it rather than touching it, because those paths were outside that slice. **Two lanes reached it from
opposite directions:** `ocr` called the copies *"implementations that drift independently — a missed metacharacter
in one silently over-matches the pin"*, and the reviewer flagged the same duplication as a drift risk.

## ⚠️ MEASURED, BY ME, AND MY FIRST MEASUREMENT WAS WRONG — so verify this list yourself

**My first enumeration returned ZERO copies: the pattern was mangled by shell escaping.** *A false zero from a
broken instrument is the one failure this batch keeps paying for.* Here is the enumeration done with a pattern
that cannot be mangled (`--fixed-strings '\$&'`), and **your first job is to reproduce it**:

| # | Site | Form |
|---|---|---|
| 1 | **`src/lib/firstRunTour.ts:300-301`** | **the canonical exported `escapeForRegExp`** |
| 2 | `e2e/weekly-series.e2e.ts:89-90` | a **private function of the same name** |
| 3 | `e2e/place-directory-in-new.e2e.ts:109` | **inline**, inside a `new RegExp(...)` |
| 4 | `scripts/guards/stale-locator-guard.mjs:202` | inline, `const escaped = text.replace(...)` |
| 5 | `scripts/guards/vacuous-absence-guard.mjs:243` | inline, inside a `.map()` |

**Not targets — these are *different* escapes, with different character classes, and merging them would be a
behaviour change:** `RsvpConfirmationDialog.tsx:47`, `ModalShell.tsx:112`, `photoStorage.ts:209`,
`backfill-place-hours.mjs:229`. **Say in your report that you excluded them and why.**

## ⚠️ THE BOUNDARY YOU MUST MEASURE BEFORE PROMISING ANYTHING

**A `.mjs` file cannot import a TypeScript module.** Sites 4 and 5 are `.mjs` guard scripts; sites 1-3 are
TypeScript. **So "one implementation everywhere" may be impossible as stated** — and the batch's rule applies:

> **A guard that pretends to be total is worse than one that says what it covers.**

**RULED:**
- **Dedupe what CAN share.** Sites 2 and 3 are TypeScript and can import a shared helper (there is precedent for
  e2e importing from `src/lib/`).
- **For the two `.mjs` sites, MEASURE the options and choose with a reason** — a plain-JS module both can import,
  or a documented boundary that says *"these two keep a copy because their environment cannot reach the TS
  helper"* **with the copy count stated**. **Do not silently leave it, and do not contort the repo to force it.**
- **State the final count of copies in the repo, before and after**, and where the survivors are and why.

**A placement question you must answer, not assume:** the canonical helper currently lives in
**`src/lib/firstRunTour.ts`** — **a copy module**, which is an odd home for the repo's regex utility. Moving it to
its own `src/lib/` module is allowed **only with a sibling test** (the build law, and `lib-sibling-guard` enforces
it). **Either choice is acceptable; an unstated choice is not.**

## Acceptance — demonstrate each

1. **Reproduce the enumeration** with the command you used, and state the count before your change.
2. **After**: the new count, and **every surviving copy named with its reason.**
3. **No behaviour change**: the escape is byte-identical in effect (show the before/after strings).
4. **A drift guard if one is cheap**: if you can make "a sixth copy" impossible or loudly detected, do it — **and
   if you cannot, say so plainly rather than building a checker that matches nothing.** *(Slice 5's rule, and the
   best move of that slice: prefer making a bad state **unconstructable** over asserting it did not happen.)*
5. `npm run verify` exits 0.

## Verify

`npm run verify`, plus `e2e/weekly-series.e2e.ts` **and** `e2e/place-directory-in-new.e2e.ts` — **the two specs
whose escaping you changed.** Run each at least twice, and **report every run**. The guard scripts are exercised by
`npm run verify`'s guards lane; if you change a guard script, run it directly too.

**Four named flake modes** — re-run once before believing any red: `no-bypass-guard`,
`e2e/places.e2e.ts:2759`, vite-4173 / trace-artifact-ENOENT, teardown `close()` throwing *"Target page, context or
browser has been closed"*. Kill listeners **by port**, never `pkill -f`.

## Report

- **`Committed as: <sha7>`** — or *"not committed"* and why; **an absent field is read as evidence.**
- Files changed with `+/-` counts.
- **The before/after copy counts**, every survivor with its reason, and **the `.mjs` boundary decision with the
  measurement behind it.**
- Both halves where applicable: the run that proves it works, and the run that proves the old behaviour is
  preserved.
- `npm run verify`: exit code, test-file count, test count, lint errors **and warnings**.
- Anything the brief did not anticipate — **say it rather than quietly fixing it.**
