# Reviewer brief — V28 Slice 3a (the card shell, the name card, the bare seam)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

Fresh context. Independent judge. Every finding must cite `file:line`. Fix
nothing.

## The diff

Slice 3a is commit **`71e2b6b`** (parent `18feb83`) on `Meisburg/onboarding`:
`git show 71e2b6b`. Three files: `src/components/FirstRunCard.tsx` (new),
`src/pages/OnboardingPage.tsx`, `src/App.tsx`.

## Intent

`plan.md` → Slice 3a. The first run (`/onboarding`) renders **bare** — no header,
no nav, no push prompt — and its name step renders inside a new presentational
card. Decision 16; ADR `docs/adr/0001-home-zip-stops-being-a-gate.md`.

## Questions — answer each, with citations

1. **Is the seam complete and correctly derived?** One `isFirstRun` and one
   `navRenders` should drive every chrome decision. Enumerate **every** place the
   shell decides to render chrome (header, rail/bottom nav, `PushOptInPrompt`,
   `<main>`'s padding, the grid column definition, anything else you find) and
   say what each now derives from. **Report any chrome element still keyed on
   `session` alone**, and any second `pathname === ONBOARDING_PATH` comparison.
2. **Is every OTHER route byte-identical?** `navRenders` must be equivalent to the
   old `session !== null` on every route except `/onboarding`. Walk the state
   space (signed-out; signed-in not first-run; signed-in first-run) and report any
   route whose chrome changed. `/playdate/:id` (public, signed-out) and `/login`
   are the ones the V22 comment names.
3. **The V22 collapse.** `App.tsx:213-225` documents a real past bug: an empty
   rail column collapsed `<main>` to 72px at md+. The builder reports a runtime
   check showing `<main>` at **1280px** with grid class
   `flex flex-col md:items-start md:grid`. **Verify by reading the code**, not by
   trusting that report: with `navRenders` false, what does the wrapper render, and
   can column 1 be empty?
4. **The outside-form submit.** The card renders its primary action **outside** the
   `<form>` and associates it via the HTML `form` attribute. **Is that the right
   structure**, or is it a workaround forced by the card's prop shape? What is the
   failure mode if the association does not apply — and **is it pinned by
   anything** (a test, a spec, a guard)? If nothing pins it, say so plainly: that
   is a silent-regression surface.
5. **Is `FirstRunCard.tsx` free of domain logic?** Read it whole against
   `docs/agents/code-structure.md` (the build law: React renders and does not
   decide). Report any rule it encodes — card order, skippability, zip/handle/kid
   logic — and any place it decides rather than receives. Also: does it take the
   primary label as a prop, and could a caller accidentally lose the
   `/^Continue/`-matching label the shared e2e helpers depend on?
6. **Is the name card functionally identical to the branch it replaced?** Compare
   against `git show 18feb83:src/pages/OnboardingPage.tsx`. The validation
   (`displayNameFieldError`), the `role="alert"` + `fieldA11y`/`errorId` error
   surface, `composeDisplayName`, `createProfile`, and the `HandleTakenError`
   message must behave exactly as before. **Report any behavioural difference**,
   including focus, disabled states, or which button is `type="submit"`.
7. **The stale claims.** The slice declares `OnboardingPage.tsx:40-41` fixed and
   two `session !== null` comments in `App.tsx` updated. Grep all three files for
   surviving claims that (a) a no-zip parent is gated/redirected, or (b) chrome is
   keyed on `session` when it now is not. Cite each.
8. **The guard order above the seam.** The `/mod` guard, the post-edit fallback
   and the `I'm coming` return target are ordered load-bearingly. Confirm the diff
   did not reorder or restructure any of them, and that the new constant was
   inserted without moving a single guard.
9. **Side effects of the builder's own runtime checks.** It created two
   `e2e-seam3a-…@gmail.com` accounts in the live test DB. Check
   `docs/agents/e2e-fixture-convention.md` and `scripts/sweep-e2e-markers.mjs`:
   **does the documented sweep actually cover those addresses**, and does anything
   need doing before the batch ends?

## Verdict

```
Verdict: PASS | NEEDS_CHANGES | BLOCKED
Findings:
  - <severity> <file:line> — <the defect> — why it matters: <the consequence>
Evidence checked: <files read, greps, diffs>
Residual risks: <what you could not check>
```

`NEEDS_CHANGES` requires at least one cited finding. Do not invent citations. If
you disagree with a premise here, say so and cite the code. You are not required
to be polite.
