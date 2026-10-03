# Slice 3b — The account card and the trimmed signup

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

Read `plan.md` → Slice 3b first (**the orchestrator amended it heavily — read it
fresh**), then `docs/agents/code-structure.md`. Slices 1–3a are done and verified.

**This is the batch's busiest slice: two production files and three spec files.**
If your context runs out mid-slice, **STOP and report with the partial diff**
rather than committing a half-moved signup. A signup that lands nowhere is worse
than an unfinished one.

## Objective

A new parent creates an account with **email + password only**, is labelled
`1 of 5`, and lands on the name card (`2 of 5`). **And every shared e2e helper
moves with them, in this same slice.**

## ⚠️ The two shared spec files that break here — both were in NO slice's scope

This is the same class as the batch's first plan defect (`e2e/fixtures.ts`) and it
is worse, because the first one is the **setup project every spec depends on**.

### 1. `e2e/auth.setup.ts:54-61` — the whole-suite landmine

It fills `given-name`, `family-name` and `street-address` **on `/login`** — all
three of the fields you are deleting. A break here is not one spec failing; it is
**every spec** failing, because `auth.setup.ts` is the Playwright setup project
that creates the marker.

**The good news, measured:** the name card carries the **same two selectors** —
`OnboardingPage.tsx:374` has `autoComplete="given-name"` and `:391` has
`"family-name"`. So the fix is an **order** change, not a rewrite:

1. sign up on `/login` with **email + password only**
2. land on `/onboarding`, fill the name card's first/last name → `Continue`
3. the location step (`Set your location`) → `98107` + `5 miles` → `Continue`
4. the feed

**Keep the REST PATCH backstop exactly as it is.** The setup's own docblock
explains why it exists, and it is what makes the marker's final location identical
whichever branch runs. Also keep the `/profile` `@handle` assertion — the handle
is now composed from the card's two fields instead of `/login`'s.

### 2. `e2e/signup-zip-fallback.e2e.ts` — dies **here**, not in Slice 5

Both its tests fill `street-address` on `/login` (line 53) and assert
`signup-zip-fallback-note` at the location step. The flag's **producer** is
`LoginPage.tsx:224` — `markSignupZipUnresolved(window.sessionStorage)` after a
failed geocode. Delete the address and the producer is gone.

The plan had this spec's retirement scheduled for Slice 5, by which time it would
have been **failing for two slices**. Update it now, per *update, never delete*:

- **Test 1** (the resolved address) becomes the **new** happy path: signup →
  name card → location step → feed.
- **Test 2** (the unresolved address) asserts the new truth: a signup with **no**
  address field lands on the interview, and **no** fallback note appears.
- **Add a comment** saying the "an address that cannot be matched explains itself"
  coverage is **relocated to Slice 5's area card**, so it reads as moved rather
  than lost. Slice 5 will assert the in-card notice.

## `src/pages/LoginPage.tsx`

- Trim the signup form to **email + password**. The given-name (`:374`),
  family-name (`:391`) and street-address (`:416`) inputs go, along with the
  address error surface around them.
- Delete the now-dead signup work: `addressFieldError(signupAddress)` (`:139`),
  `composeDisplayName(firstName, lastName)` (`:144`), the
  `zipFromAddressQuery` call (`:214`) and `markSignupZipUnresolved` (`:224`).
- **Remove the imports those leave unused** — `addressFieldError`,
  `zipFromAddressQuery`, `markSignupZipUnresolved`, and `composeDisplayName`.
  (`tsc` runs with `noUnusedLocals: true`, so it will tell you; do not silence it
  with an underscore — delete.)
- `createProfile(name)` (`:177`) can no longer run: the name comes from card 2.
  **Decide and report** what replaces that branch — the account is created and the
  parent is sent to `/onboarding`, where the name card creates the profile row
  (that is what 3a built). Do not leave a call that cannot work.
- Label the signup `1 of 5` and **navigate to `/onboarding`** (today `:241` sends
  `/`).
- Keep `armPushPromptForAction('signup')` unless you can show it must go.

## `e2e/fixtures.ts`

- `signUpViewer` (`:356`) drops the three removed field fills (`:367`, `:368`,
  `:370`) and instead **walks to the name card** — fill first/last there, press
  `Continue`.
- `finishSignup` (`:398`) learns the name hop. Its current `feed.or(locationStep)`
  race (`:407`) is the shape to think about: after this slice the parent lands on
  `/onboarding` **always**, so the race is no longer between feed and location
  step.

## `src/pages/OnboardingPage.tsx`

Fix the **carry-over** from 3a's review — `OnboardingPage.tsx:262-263`:
*"Refresh the shared session state before leaving so the shell's onboarding gate
(and header) see the new home zip."* Since slice 2b the gate does not key on the
home zip and the header shows none. **Pre-existing** (byte-identical in 3a's
parent), not introduced by 3a — fix it because this slice owns the file.

## The other carry-over: pin the form association

`FirstRunCard`'s form-mode primary button sits **outside** the `<form>` and is
joined to it **only** by the HTML `form` attribute. 3a's reviewer confirmed that
is the right structure and that **nothing pins it** — if the id and the attribute
drift, **"Continue" silently submits nothing**: a dead step, no error, no console
output.

All three `/^Continue/` helpers (`e2e/fixtures.ts:418`, `e2e/auth.setup.ts:100`,
`e2e/signup-zip-fallback.e2e.ts:149`) currently resolve to the **location** step's
button. Once your helpers move onto the **name card**, they exercise the
association through a real spec. **Name in your report which helper now proves
it** — that is the only pin this surface will have.

## Acceptance criteria

- Signup collects **email + password only**; given-name, family-name and
  street-address are gone from `/login`.
- Signup success lands on `/onboarding`, not `/`. Signup is labelled `1 of 5`; the
  name card is still `2 of 5`.
- `/login` no longer imports `composeDisplayName`, `addressFieldError`,
  `zipFromAddressQuery` or `markSignupZipUnresolved`.
- **`e2e/auth.setup.ts` completes the new sequence and the marker still ends with
  `home_zip=98107` / 5 mi**, and its `/profile` `@handle` assertion still passes.
- `signUpViewer` no longer touches any removed selector; `finishSignup` reaches
  the feed from the new sequence.
- **No signup spec touches a removed selector.** Run
  `rg -n 'street-address' e2e/ src/pages/LoginPage.tsx` and **check each hit** —
  a hit on a place/address surface is legitimate, a hit in a signup context is not.
- The form association is pinned, and you have named the helper that proves it.

## Verify

```
npm run verify
npx playwright test e2e/golden-path.e2e.ts e2e/onboarding-gate.e2e.ts e2e/signup-zip-fallback.e2e.ts
```

Paste real tails: lint against the **80 warnings / 0 errors** baseline, tests
against **65 files / 1975 tests**. **These three specs must pass — do not edit any
of them to make them pass.** If one fails, report it: a failing spec here means the
flow is wrong, which is the whole point of the slice.

## Out of scope

`src/App.tsx` (the resume nudge is **Slice 3c** now), the kids/photo/area cards
(4, 5, 6), `e2e/**` other than the three named files, `src/lib/firstRun.ts`,
`plan.md`, `task-state.md`, `.scratch/**`, `.opencode/**`.

## Commit and report

Scoped `git add`. Only when green:

```
V28 slice 3b: signup is email and password, and the helpers move with it
```

Report:

```
Status: DONE | BLOCKED
Files changed: <path> <what and why>
What replaced createProfile on /login: <answer>
The helpers: signUpViewer <what it does now> | finishSignup <what it does now>
auth.setup.ts: <the new sequence, and how the marker's final state is unchanged>
signup-zip-fallback.e2e.ts: <what each test asserts now, and where the coverage moved>
The form association is pinned by: <which helper, and how>
Removed-selector grep: <every hit, classified signup | legitimate>
Commands run: <real tails; lint vs 80/0; tests vs 65/1975; the three specs>
Gate green: yes | no
Commit: <sha>
Risks: <or "none">
Unresolved questions: <or "none">
```
