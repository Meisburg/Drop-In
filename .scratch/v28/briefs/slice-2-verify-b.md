# Slice 2 verify — BOUNDED RE-RUN (read the cap first)

You are `orchestrator-verifier`. The previous verify lane on this slice **timed out at 30 minutes**
after authoring its own probe scripts and a polling script. It did not finish its report.

## ⛔ THE BOUND — this is the most important instruction in this brief

- **Run EXACTLY the commands listed below. Nothing else.**
- **Do NOT author scripts**, do not write probe files, do not poll, do not re-derive an assertion
  that already has a passing test.
- **Do NOT re-run `npm run verify`.** It is already green **at this exact commit** (`2e784d3`): the
  previous lane recorded `exit code 0`, `Test Files 66 passed (66)`, `Tests 1988 passed (1988)` —
  an exact baseline match. Re-running it would spend the budget the remaining checks need. The tree
  has not changed since, so that evidence stands.
- The four sections below take roughly **6–10 minutes** in total. If you find yourself past that,
  stop and report what you have.
- Report **as soon as the commands finish**. Do not keep investigating.

Worktree: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.
**Slice commit `2e784d3`.** The tree should be clean at `9ba9480` (a planning-only commit); if HEAD
differs, say so and check whether the difference touches source before proceeding.

## 1. `npm run typecheck`

Report its exit code. That is the whole section.

## 2. The specs that ride the changed card

```
npx playwright test e2e/onboarding-resume.e2e.ts e2e/signup-zip-fallback.e2e.ts e2e/avatar.e2e.ts
```

Report the pass/fail/skip counts **verbatim**.

**Already established — do not re-establish:** `e2e/name-card-photo.e2e.ts` passed (`2 passed, 15.2s`,
`LANE3_EXIT=0`) in the previous lane, with the setup spec. Do not re-run it.

## 3. The `finishSignup` blast radius

`e2e/fixtures.ts` changed and **17 spec files** ride `finishSignup`/`signUpViewer`. The new photo
block sits on the card `signUpViewer` clicks Continue on **with no photo**, so a hung Continue would
appear here as a timeout:

```
npx playwright test e2e/no-zip-notice.e2e.ts e2e/dm.e2e.ts e2e/kids-v3.e2e.ts
```

Report counts verbatim, per spec.

## 4. The fixture-marker convention (READ-ONLY)

Read `docs/agents/e2e-fixture-convention.md`, then look at the markers in the new
`e2e/name-card-photo.e2e.ts`. **Report whether its fixtures are sweepable under that convention.**
**Do NOT run a sweep** — the orchestrator owns that at batch end. This section is a read and a
sentence, nothing more.

## Housekeeping

Kill any listener **by port**, never `pkill -f`. Headless only. Never touch the human's Chrome. Leave
the tree clean. Note the ports you opened and confirm free.

## Report format

For each section: the raw command, the exit code, and the output tail. Then **Passed / Failed / Did
not run**, explicitly, and any residual risk you found. If you ran out of budget, say exactly where
you stopped — a truthful partial report is worth more than an overrun.
