# Reviewer brief — V28 Slice 2b (the gate stops bouncing)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

Fresh context. You are the independent judge. Review the diff, not the prose. Every
finding must cite `file:line`. Do not fix anything.

## The diff

Slice 2b is commit **`c6c1256`** (parent `f852b7e`) on `Meisburg/onboarding`:
`git show c6c1256`. Three files: `src/lib/onboarding.ts`, `src/App.tsx`,
`src/lib/onboarding.test.ts`.

## The plan slice it must satisfy

`plan.md` → Slice 2b. The intent in one line: **a signed-in parent with no home
ZIP reaches every route, because the location requirement now lives at the write
paths (added by Slice 2a at `fda9ccc`) instead of at an app-wide wall.**

## Questions — answer each, with citations

1. **Is every parameter of `resolveProtectedRedirect` actually read?** For each
   parameter in order, name the line that reads it and what it changes about the
   return value. If any parameter's value can never affect the result, say so
   plainly, and say what you would do with it. (`tsconfig.app.json` — read it —
   and `docs/agents/code-structure.md` may inform your answer; the build law says
   what it says, not what I claim it says.)
2. **Did the bounce actually go, and did anything else go with it?** The
   signed-out leg must survive: verify a signed-out visitor on the public detail
   route is still handled, and that nothing now redirects a **signed-in** parent
   away from any route. Enumerate the outcomes of `resolveOnboardingGate` for the
   state matrix (suspended × sessionLoading × signedIn × profileLoading ×
   homeZipSet) and report any state whose outcome changed **besides** the intended
   one, or which is now unreachable.
3. **`'loading'` and `'suspended'`.** Are both still reachable and still winning
   where they must? Are the cold-load race tests (`onboarding.test.ts`, the two
   `it`s about loading) unchanged and still meaningful? Quote them.
4. **Stale claims.** Grep for the old rule in prose and in code: any remaining
   mention of an `/onboarding` bounce, of the gate keying on the home zip, or of
   an `'onboard'` decision — in `src/`, `e2e/`, `docs/`, `CONTEXT.md`, or
   `.scratch/` docs that describe current behaviour. A comment that justifies a
   deleted rule is a defect. Cite each.
5. **The added test.** The brief asked for a pin that a no-zip parent is not
   bounced out of an `I'm coming` return target. Find the added test. **Is it a
   real pin or a tautology** — would it fail if the bounce came back? Would it
   fail for any other reason? A test that cannot fail is worse than no test.
6. **Scope and blast radius.** Does the diff touch only the three declared files?
   Do `e2e/` specs or any other consumer depend on the behaviour this slice
   changes — name the spec files and the assertions. `e2e/onboarding-gate.e2e.ts`
   is one to check specifically: state whether it still fails-if-broken, and what
   it now does and does not pin.

## Verdict

```
Verdict: PASS | NEEDS_CHANGES | BLOCKED
Findings:
  - <severity> <file:line> — <the defect> — why it matters: <the consequence>
Evidence checked: <files read, greps run>
Residual risks: <things you could not check>
```

`NEEDS_CHANGES` requires at least one finding with a citation. Do not report a
finding you cannot cite. Do not invent citations — a finding whose cited evidence
you have not read is worse than no finding. **If you disagree with a premise in
this brief, say so and cite the code.** You are not required to be polite.
