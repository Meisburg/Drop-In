# Reviewer brief — V28 Slice 3b (signup becomes card 1, helpers move with it)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

Fresh context. Independent judge. Every finding must cite `file:line`. Fix nothing.

## The diff

Slice 3b is commit **`3080c65`** (parent `0cbb49f`): `git show 3080c65`. Five
files: `src/pages/LoginPage.tsx`, `src/pages/OnboardingPage.tsx`,
`e2e/fixtures.ts`, `e2e/auth.setup.ts`, `e2e/signup-zip-fallback.e2e.ts`.
(+252/−436 — a large net deletion, which is expected for a trim.)

## Intent

`plan.md` → Slice 3b. A new parent signs up with **email + password only**, is
labelled `1 of 5`, and lands on the name card (`2 of 5`). The address leaves
`/login` here, not in Slice 5. Every shared e2e helper moves in this slice.

## Questions — answer each, with citations

1. **Is the signup flow correct end to end?** Trace `LoginPage.tsx`: what does
   submit do, what does it navigate to, and what guards could still send a freshly
   signed-up parent somewhere else? The builder introduced a `justSignedUp` flag to
   hold off a bounce-to-home guard — **read it**: does it leak across sign-ins,
   race a slow session, or leave a state where a parent is sent to `/` (or bounced
   to `/login`) instead of the interview? Report any path where signup does not
   land on `/onboarding`.
2. **What replaced `createProfile` on `/login`?** The profile row must still be
   created **exactly once** — by the name card — and the `HandleTakenError` path
   must still work. Is there any path where an account exists with **no** profile
   row, or two?
3. **The name card's prefill and touched flags.** `OnboardingPage.tsx:80-88` now
   uses per-field `firstNameTouched`/`lastNameTouched` instead of one shared
   `nameTouched`. Verify the wipe bug is **actually fixed**, not masked: what
   happens if the parent edits the *last* name first, or edits then clears a field?
   Does the social-sign-in prefill still work?
4. **Are the three spec files faithful, or weaker?** Compare
   `e2e/signup-zip-fallback.e2e.ts` against its parent version (`git show
   0cbb49f:e2e/signup-zip-fallback.e2e.ts`). **Its two old tests asserted real
   product rules** (account creation is non-blocking; a failed address lookup
   explains itself; the note is one-shot; the address-privacy copy). The plan
   schedules the fallback coverage to be **relocated to Slice 5's area card**.
   Report: is anything **lost** rather than relocated, and does the new file say
   where the coverage went? Same question for `signUpViewer`/`finishSignup` — did
   any assertion get dropped in the rewrite?
5. **Is the `Continue` label still unambiguous?** Both the name card and the
   location step render a `/^Continue/` button. The shared helpers use
   `getByRole('button', { name: /^Continue/ })`, which **throws if two match**.
   Confirm from the code that the two can never render simultaneously, and cite the
   branch that makes that true.
6. **Did the trim leave anything stale or dead?** Grep `src/` and `e2e/` for
   claims about the signup address, the geocode, or `markSignupZipUnresolved`:
   `rg -n "signupAddress|addressFieldError|zipFromAddressQuery|markSignupZipUnresolved|street-address|composeDisplayName"`
   — classify each hit: legitimate, dead code, or a stale claim. (The orchestrator
   already verified `street-address` has no hits in `e2e/` or `LoginPage.tsx`.)
7. **Does anything outside the three specs break?** Grep `e2e/` for selectors,
   labels or ids the trim removed (any spec that visits `/login` and expects the
   old fields), and name any spec that would now fail but was not in this slice's
   verification command.
8. **Scope.** List the files `3080c65` changes and whether any `src/`, `e2e/`,
   script or config path outside the declared five moved across
   `0cbb49f..3080c65`. The orchestrator's record commits are **not** scope
   violations.

## Verdict

```
Verdict: PASS | NEEDS_CHANGES | BLOCKED
Findings:
  - <severity> <file:line> — <the defect> — why it matters: <the consequence>
Evidence checked: <files read, greps, diffs>
Residual risks: <what you could not check>
```

`NEEDS_CHANGES` requires at least one cited finding. Do not invent citations — a
finding whose evidence you have not read is worse than no finding. If you disagree
with a premise here, say so and cite the code. You are not required to be polite.
