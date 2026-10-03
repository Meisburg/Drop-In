# Fix round 1/5 — V28 Slice 2b (stale claims of the rule this slice deleted)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

You built Slice 2b at `c6c1256`. A fresh-context reviewer read the diff: **the
runtime behaviour is correct and complete against every acceptance criterion** —
the verdict is NEEDS_CHANGES purely because the slice deleted a rule and left the
sentences that justified it standing. Read `plan.md` → Slice 2b again; the
orchestrator has amended its acceptance criteria with all of this.

**All citations below were verified by the orchestrator. They are real.**

## Finding 1 (blocking) — `src/App.tsx:50-58`, the primary docblock

It still reads: *"a signed-in user without a home zip is sent to /onboarding
first (V2 slice 3: the gate keys on home_zip …) … never bounced through
/onboarding → /."*

That is the docblock of the very function you changed, it is now false, and it
**directly contradicts the new inline comment you wrote at `App.tsx:85-91` thirty
lines below.** Rewrite it: all routes require a session; there is no location
bounce; the requirement lives at the write paths; the cold-load note stays (that
part is still true, minus the bounce). Point at
`docs/adr/0001-home-zip-stops-being-a-gate.md`.

## Finding 2 (blocking) — `src/lib/onboarding.test.ts:15-18`, the file header

*"Onboarding-gate tests (V2 slice 3: the gate keys on the home zip, not
memberships …)."* The gate no longer keys on the home zip. Rewrite it.

## Finding 3 (blocking) — `src/lib/onboarding.test.ts:95-96`, a rationale that is now false

```
// A stale homeZipSet=false must NOT bounce the user to /onboarding
// mid-load — that is the cold-load race this gate fixes.
```

There is no `/onboarding` bounce to guard against. **The test still passes and
must keep passing — it passes for a different reason now:** `profileLoading`
makes the gate render `'loading'` instead of a route. Rewrite the comment to say
*that*, and keep the assertion.

## Finding 4 — `src/App.tsx:245`

*"the route is gated by the shell's auth + home-zip redirect"* — no home-zip
redirect survives. Fix it (the route is still auth-gated; say only that).

## Finding 5 — the slice silenced the compiler instead of removing dead signal

`resolveProtectedRedirect`'s `homeZipSet` is never read. You renamed it
`_homeZipSet` and documented *why it is unused*. But **this project sets
`noUnusedParameters: true` (`tsconfig.app.json:21`)** — its own law is that an
unused parameter is an error, and TypeScript literally told you so:

```
src/lib/onboarding.ts:38:3 - error: typescript: 'homeZipSet' is declared but its value is never read.
```

**Remove the parameter** rather than exempting it. Update its callers:
`shellRedirect` (`src/App.tsx:336`, which should lose its own forwarded
`homeZipSet` too) and the tests.

**The same class, found by the reviewer:** `OnboardingGateState.homeZipSet`
(`src/lib/onboarding.ts:83`) is no longer read by `resolveOnboardingGate`, yet
`src/App.tsx:88` still feeds it in. **Remove the field** and the argument, and
update the tests.

Two honest consequences you must accept and report:
- The tests *"passes a settled signed-in user with a home zip"* and *"passes a
  settled signed-in user without a home zip"* now assert the **same** thing,
  because the gate genuinely no longer distinguishes them. **Merge them into one
  test named for what it now pins** — do not keep two names pretending at a
  distinction the signature no longer has.
- `gateState({ profileLoading: true, homeZipSet: false })` loses its second
  argument.

If you conclude removing either is wrong, **do not silently keep it** — cite the
line that reads it and report why. Do not re-add a `_` prefix.

## Keep

Everything the reviewer validated: the deleted bounce, the intact
`resolveAuthRedirect` signed-out leg, the surviving `'loading'`/`'suspended'`
outcomes, the added return-target pin (the reviewer confirmed it is a **real
pin** — it fails if the bounce returns), and `resolveOnboardingRedirect`
untouched.

## Out of scope — do NOT touch these

The reviewer swept the repo and found the same stale claim in files this slice
does not own. They are **already assigned**: `OnboardingPage.tsx` → Slice 3a,
`FeedPage.tsx:491` → Slice 2c, and `src/lib/db.ts`, `ProfilePage.tsx`,
`e2e/auth.setup.ts`, `e2e/fixtures.ts`, `e2e/places-map-view.e2e.ts` and the
`onboarding-gate.e2e.ts` docblock → Slice 7. **A slice that owns a file owns its
stale claims**; do not widen your diff into theirs.

## Evidence — greps, as acceptance

1. `rg -n "home zip|homeZipSet|/onboarding" src/App.tsx src/lib/onboarding.ts src/lib/onboarding.test.ts`
   → paste it. Every surviving line must be true after the change.
2. `rg -n "_homeZipSet|homeZipSet" src/` → the dead param and field are gone
   (a `setHomeZipSet` in `db.ts` is a *different* symbol and is fine).
3. `rg -n "'onboard'" src/` → still no hits.

## Verify

```
npm run verify
npx playwright test e2e/onboarding-gate.e2e.ts
```

Paste real output tails **including the lint warning count** — the previous report
said "warnings are pre-existing" with no number, and a count with no output is
what this lane exists to stop. The baseline is **80 warnings / 0 errors**. If it
is 80, say so; if it moved, say why. Do not edit the spec.

## Commit

Scoped `git add`. Only when green:

```
V28 slice 2b fix 1/5: delete the dead zip signals and every claim of the deleted rule
```

Do not push.

## Report

```
Status: DONE | BLOCKED
Files changed:
  - <path> <what and why>
Commands run:
  - <command> -> <result>  (real tails, INCLUDING the lint warning count vs the 80 baseline)
Grep 1 (surviving zip/onboarding claims in the three files): <output>
Grep 2 (dead signals gone): <output>
Which two gate tests merged, and what the single test now asserts: <answer>
Gate green: yes | no
Commit: <sha>
Risks: <or "none">
Unresolved questions: <or "none">
```
