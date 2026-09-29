# Slice 5 — The area card (card 5 of 5)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

Read `plan.md` → **Slice 5** (read it fresh — it has been amended), then
`docs/agents/code-structure.md`. Slices 1–4c are done and verified: a new parent
signs up, lands in the interview, fills kids and a photo, and a returning parent
resumes at the card they left. The interview's last step is still the **old
location view**.

## The job

Turn that step into **card 5 of 5** — **the address first, ZIP as fallback**
(decision 9) — and delete the now-dead signup-fallback machinery.

**Grounded facts (trust the file over my line numbers):**
- The validators and options you need already exist in **`src/lib/feed.ts`**:
  `RADIUS_MILES_OPTIONS = [1, 2, 5, 10, 20, 35]` (`:69`),
  `DEFAULT_RADIUS_MILES = 5` (`:72`), `validateHomeZip(zip, knownZips)` (`:137`).
  **Do not re-declare them.**
- **`src/lib/geocode.ts` already has the injected seam**: `type AddressLookup`
  (`:39`), `geocodeAddress` (`:82`), `zipFromResult` (`:123`),
  `zipFromAddressQuery` (`:138`). Per the build law, the module takes its client —
  use that seam rather than calling `fetch` inline, so the card is testable.
- The current location view: `zipError` (`:112`), `radiusMiles` (`:113`), the
  seeded-gazetteer load (`:222-234`), and the write
  `updateHomeZipRadius(session.user.id, homeZip.trim(), radiusMiles)` (`:363`).
- The card reads **`5 of 5`** via `progressLabel('area')`, and its
  `title`/`body`/`primaryLabel` come from **`FIRST_RUN_COPY.area`** — the pattern 4a
  and 4b established. **Nothing hard-coded.**

## ⚠️ THREE RULES THAT ARE THIS SLICE'S, EACH LEARNED THE HARD WAY

1. **REUSE `addressFieldError`, DO NOT DELETE IT.** `src/lib/account.ts:76` looks
   dead after 3b removed the signup address field — **it is not dead, it is the
   validator this card needs.** Wire it to the address input.
2. **THE PENDING-STATE RULE (named in 4c's review).** Your card adds an **async
   geocode** that gates the next step. 4c's "Checking your kids…" state was found to
   have **no Skip, no retry, no timeout**, so a promise that never settles would
   **stall the run indefinitely — and decision 6 says the run is never a wall.**
   **Any async fact or step that gates a card must have a bounded escape**: a
   timeout that settles to "absent" plus a skippable error line, or a Skip on the
   pending state itself. Apply it to the lookup.
3. **`e2e/auth.setup.ts` IS IN SCOPE BY NAME.** It is a **second, independent walk**
   of this flow and has broken **three times** (3b, 4a, 4b). Your card changes the
   walk again — **fix it in this slice and report it**; that is expected, not a scope
   violation. (My previous brief forgot to name it. That was my defect, not a
   builder's.)

## What to remove

The signup ZIP-fallback machinery, which is now reachable by nothing (verified:
definitions only, **zero call sites**):

- `SIGNUP_ZIP_FALLBACK_KEY` / `markSignupZipUnresolved` (`src/lib/onboarding.ts:128`, `:138`)
- `zipFromAddressQuery` (`src/lib/geocode.ts:138`) — **unless** the card's own lookup
  path genuinely needs it; if so, **say so in your report** rather than deleting a
  function you then re-implement.
- **Nothing references `dropin.signup.zip-unresolved`** anywhere — confirm by grep.
- **And fix the stale doc comment at `src/lib/geocode.ts:11`** — it still calls
  `zipFromAddressQuery` "the **signup form's** use of the same service". You own this
  file this slice, so you own its stale claims.

## Acceptance criteria (plan's, plus the above)

- The three fallback symbols are gone and nothing references
  `dropin.signup.zip-unresolved`.
- **Entering a resolvable address sets `home_zip` without the parent typing a ZIP.**
- An unresolvable address **reveals the ZIP field and the existing notice**; it
  **never blocks** and **never loses the typed address**.
- The radius picker offers exactly `RADIUS_MILES_OPTIONS` and defaults to
  `DEFAULT_RADIUS_MILES`.
- `validateHomeZip` gates the ZIP against the seeded gazetteer, **inline**.
- The card reads **`5 of 5`**.
- **The ending it lands on is Slice 6's, not this slice's.** Do **not** build a
  finish card and do **not** touch the page's redirect guard
  (`resolveOnboardingRedirect` / the `<Navigate>` at `~:250`) — completing this card
  still lands on the day-1 end state until **Slice 6 re-keys that guard** (plan defect
  #19: the finish card is unreachable while the guard bounces a zip-having parent).

## Verify

```
npm run verify
npx playwright test e2e/address-maps.e2e.ts e2e/zip-radius.e2e.ts e2e/signup-zip-fallback.e2e.ts
npx playwright test e2e/golden-path.e2e.ts
```

Paste real tails. **Lint is expected at 0 errors / 81 warnings** — a **second** new
warning is a finding. Tests are expected at **66 files / 1981 tests**; if you add
tests, say the new number and why. **The `[setup]` line must be green.**

If a spec fails because the machinery left or the card arrived, that is the flow
changing — **fix the walk and report it; never delete or loosen an assertion to go
green.**

## Out of scope

The finish card and the redirect re-key (Slice 6), `src/App.tsx`, the nudge,
`src/lib/firstRun.ts`, `FIRST_RUN_COPY`'s other entries, `src/pages/LoginPage.tsx`,
the `profiles.bio` column, `plan.md`, `task-state.md`, `.scratch/**`.

## Commit and report

```
V28 slice 5: the area card — address first, ZIP as fallback
```

```
Status: DONE | BLOCKED
Files changed: <path> <what and why>
The card: <how the address resolves a zip; the fallback behaviour; the radius picker>
The pending-state rule: <what bounded escape you gave the lookup>
e2e/auth.setup.ts: <what the walk needed, and whether it is green>
addressFieldError: <confirmed reused, not deleted>
Removals: <each symbol gone, and any you kept with the reason>
geocode.ts:11: <the comment fixed>
Commands run: <real tails; lint vs 81; tests vs 66 files/1981; the [setup] line>
Gate green: yes | no
Commit: <sha>
Risks: <or "none">
Unresolved questions: <or "none">
```
