# Slice 2 verify — you are the deterministic referee

You are `orchestrator-verifier`. **Run the real commands and report raw outcomes.** Do not judge
intent; that is the reviewer's lane.

Worktree: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.
**Slice commit `2e784d3`**, base `aac2bab`. Brief: `.scratch/v28/briefs/slice-2.md`.

## Before anything: tree state

`git log --oneline -1`, `git rev-parse HEAD`, `git status --porcelain`. **If HEAD is not `2e784d3` or
the tree is not clean, report that and check whether the difference is code or planning-only**
before proceeding — last round the tree was one planning-only commit ahead, that was proven inert,
and that was the right handling. Do not refuse, and do not silently proceed.

## 1. The slice gate

`npm run verify`. Report the **exit code**, the `Test Files` / `Tests` counts **verbatim**, and lint
error/warning line counts.

**Baseline to compare against: 66 test files / 1988 tests / 0 lint errors / 81 warnings.** A slice
that adds no unit tests should keep 1988; say so if it moved, and explain the delta.

Then `npm run typecheck` and report its exit code separately.

**Known flake:** `scripts/guards/no-bypass-guard` fails under parallel load and passes 26/26 in
isolation. **Re-run once before reporting it as a failure.**

## 2. The browser lane (the part that can actually falsify this slice)

**Targeted, not the full sweep.** Kill any listener **by port**, never `pkill -f`. Headless. Never
touch the human's Chrome.

```
npx playwright test e2e/name-card-photo.e2e.ts e2e/onboarding-resume.e2e.ts e2e/signup-zip-fallback.e2e.ts e2e/avatar.e2e.ts
```

Report **pass/fail/skip counts verbatim**, and the per-spec breakdown.

**Independently confirm the slice's headline claim** — do not take the new spec's word for it that
the assertion means what the builder says. The claim is: after uploading on card 2, the object
exists in the `avatars` bucket at `<uid>/avatar` **and** the created `profiles` row's `avatar_url`
carries the `?v=` URL. If you can read the row back and the object independently (the repo has
`bash scripts/db-sql.sh --read "…"`), do it and show the output.

## 3. The `finishSignup` consumers (the blast radius)

`e2e/fixtures.ts` changed, and **17 spec files** ride `finishSignup`/`signUpViewer`. The new photo
block sits on the name card — the very card `signUpViewer` clicks Continue on **with no photo**.
Run at least three consumers beyond the four above, e.g.:

```
npx playwright test e2e/no-zip-notice.e2e.ts e2e/dm.e2e.ts e2e/kids-v3.e2e.ts
```

Report counts verbatim. **A hung Continue would show here as a timeout** — name it if it appears.

## 4. The fixture-marker convention

The slice adds a NEW spec file, which means new marker rows. `npm run verify` runs
`fixture-marker-guard`, but that proves the convention, not the cleanup. Check the new spec's
markers against `docs/agents/e2e-fixture-convention.md` and **report whether its fixtures are
sweepable** — do not run a sweep yourself; the orchestrator owns that at batch end.

## Report format

- Raw command, exit code, and output tail for each of the four sections.
- **Passed / Failed / Did not run**, explicitly.
- **Residual risks you found yourself**, including anything you could not capture (a backgrounded
  launch's exit code is a real example from last round — say so rather than implying a captured code).
- Leave the tree clean, and release any port you opened.
