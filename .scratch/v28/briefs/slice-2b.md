# Slice 2b — The gate stops bouncing

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

Read `plan.md` → Slice 2b first, then this. Read `docs/agents/code-structure.md`
(the build law). Slice 2a is complete at `fda9ccc`: every write path that sets a
ping or creates a post now requires a home ZIP via `hasHomeZip`
(`src/lib/homeZip.ts`). **That is why this slice is safe** — the location
requirement is not being deleted, it is being *moved off* the app-wide wall and
onto the writes.

## Objective

A signed-in parent with no home ZIP reaches every route. The gate stops
redirecting them.

## The exact edits

### 1. `src/lib/onboarding.ts` — delete the bounce

- `resolveProtectedRedirect` (lines 34–46): delete **only** line 44's bounce
  (`if (signedIn && needsOnboarding(homeZipSet)) return ONBOARDING_PATH`).
  **Keep the `resolveAuthRedirect` delegation at lines 39–40 untouched** — the
  signed-out → `/login` leg is a different rule and must survive.
- The doc comment at lines 24–33 and the inline comment at lines 41–43 both
  explain *why* the bounce existed and why it was signed-in-only. Both become
  false. **Rewrite them** to say what is now true: there is no location bounce;
  the requirement lives at the writes (see `docs/adr/0001-home-zip-stops-being-a-gate.md`).
  A stale comment that justifies a deleted rule is worse than no comment.
- `resolveOnboardingGate` (line 110): delete the `'onboard'` return. Line 66's
  union drops `'onboard'`:
  `export type OnboardingGateDecision = 'suspended' | 'loading' | 'pass'`.
  Rewrite the doc bullet list at lines 88–105 so it no longer promises an
  `/onboarding` decision.

**DO NOT TOUCH `'loading'` OR `'suspended'`, and do not touch the tests that pin
them** (`onboarding.test.ts:87` and `:91`, the cold-load race). If you find
yourself editing those two tests, stop — you have gone wrong. A note on why
`'loading'` still matters: after this slice it is no longer what stops the
bounce (there is no bounce), it is what stops routes *rendering* before the
session and profile have loaded. Keep it.

### 2. Leave alone, deliberately

- `resolveOnboardingRedirect` (lines 56–63): **signature and body unchanged.**
  `(true, false)` → `null`, `(true, true)` → `HOME_PATH`, `(false, true)` →
  `LOGIN_PATH`. A profile row requires a `display_name` and a zip requires a
  profile row, so `finished ⟺ homeZipSet` — re-keying this would be a no-op.
- `needsOnboarding` (line 20) stays: `resolveOnboardingRedirect` still uses it.
- `ONBOARDING_PATH` and `HOME_PATH` stay.
- The signup-ZIP-fallback block (lines 114–169) is untouched — that is Slice 5.

### 3. `src/App.tsx` — two stale comments, one real note

- Line 87's comment lists `'onboard'` as a possible decision. Update it.
- Line 185's comment says the return target waits for "the 'onboard' redirect".
  Update it, and **add the note this slice makes true**: the `I'm coming` return
  target (line 191, `gate === 'pass'`) now also fires for a **no-ZIP parent**,
  because `'pass'` no longer implies a zip. This is deliberate (see plan Risks):
  it honours an explicit tap, and the resume nudge covers the rest. Write that
  down where the next reader will hit it.
- No other `App.tsx` change. The `shellRedirect` call at line 332 and the
  `resolveOnboardingRedirect` call at line 203 are correct as written.

## `src/lib/onboarding.test.ts` — update two, add one

- Line 46 (`sends signed-in users without a home zip to /onboarding`) — no longer
  true. Rewrite it as: a signed-in user **without** a home zip keeps the intended
  route.
- Line 103 (`sends a settled signed-in user without a home zip to /onboarding`) —
  rewrite as: a settled signed-in user without a home zip **passes**.
- **ADD the pin the plan demands** — the `I'm coming` return target for a no-zip
  parent. The honest lib-level pin is the scenario stated as itself:

  ```
  it('does not bounce a no-zip parent out of an "I\'m coming" return target', () => {
    expect(resolveProtectedRedirect(true, false, '/playdate/abc123')).toBe('/playdate/abc123')
  })
  ```
  Name the scenario, not the function. The `App.tsx:191` linkage itself is not
  unit-testable (this repo's tests are `.ts` only — zero `.tsx` test files), which
  is exactly why the comment at item 3 above carries it and why Slice 7's flow
  lane covers the real path.

## The invariant you must attest in the report

**The location requirement must never be absent at a slice boundary.** This slice
removes the wall, so state in your report **where the requirement now lives** —
name the files and functions. (Expected: the four guarded write paths from 2a,
plus the resume nudge landing in 3b.) If your list is empty, you have removed the
requirement rather than moved it, and you must stop and report BLOCKED.

## Evidence — two greps, as acceptance

1. `rg -n "'onboard'" src/` → **no hits.** The decision string is gone, not
   merely unused. (If a hit remains in a comment, that comment is stale.)
2. `rg -n "resolveProtectedRedirect\(" src/` → unchanged call sites; the
   signed-out leg still delegates to `resolveAuthRedirect`.

## Verify

```
npm run verify
npx playwright test e2e/onboarding-gate.e2e.ts
```

Note on that spec: it asserts a cold full-page `/profile` load lands on
`/profile`. After this slice the bounce removal guarantees that too, so the spec
no longer *uniquely* pins `'loading'` — the lib tests at `onboarding.test.ts:87`
and `:91` are now the durable pin. **Do not weaken or delete the spec to make
anything pass**; if it fails, report it.

## Out of scope

`src/pages/**` (2a and 2c), `src/lib/firstRun.ts`, `e2e/**`, `plan.md`,
`task-state.md`, `.scratch/**`, `.opencode/**`.

## Commit

Scoped `git add`. Only when green:

```
V28 slice 2b: the location wall stops redirecting -- the requirement lives at the writes
```

Do not push.

## Report

```
Status: DONE | BLOCKED
Files changed:
  - <path> <what and why>
Commands run:
  - <command> -> <result>  (real output tails)
Grep 1 ('onboard' gone from src/): <output>
Grep 2 (resolveProtectedRedirect call sites): <output>
WHERE THE LOCATION REQUIREMENT NOW LIVES: <files + functions, or "EMPTY -- see above">
Tests changed (46, 103) + the added return-target pin: <what they assert now>
Gate green: yes | no
Commit: <sha>
Risks: <or "none">
Unresolved questions: <or "none">
```
