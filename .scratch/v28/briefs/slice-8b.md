# Slice 8b — mechanical determinism and test honesty

You are `orchestrator-builder`. **Read `docs/agents/code-structure.md` before writing anything.**
Worktree: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.
**Read `plan.md` §6 slice 8** — it was split in two; **this is 8b**. **8a is not yours.**

**Why this half exists:** slice 8 had accumulated eleven workstreams, which is more than one builder
context holds. The split is by independence. This half is everything where **a machine could do the
job better than a person's attention**, plus the tests that could currently lie to us.

**If the sweep plus its guard does not fit alongside the rest, STOP and report** rather than rushing
the guard. Another split is cheaper than a bad guard.

## 1. The trailing-newline sweep, THEN the guard — in that order, in two commits

**Measured 2026-09-30: 79 tracked files have no trailing newline** — `src/` 44, `e2e/` 22,
`scripts/` 13 (`.ts` 48, `.tsx` 18, `.mjs` 9, `.sh` 2, `.py` 2). **All 79 were verified to be text, so
appending a newline cannot corrupt a binary** — re-check that before you sweep anyway, and if a binary
is in your list, stop and ask rather than appending.

**An earlier count said 65.** That was `src/` + `e2e/` before slice 3 added `e2e/onboarding-kid-photo.e2e.ts`
without one. **Which is the whole point: the class has now recurred FOUR times in this batch**, including
**twice inside a fix that was itself curing an earlier instance** — and that is what promoted it from "a
nit" to "a guard."

**Order is load-bearing: sweep first, guard second.** A full-repo guard added first cannot go green
without either diff-scoping or an allowlist, and both of those defeat it. So:

1. **Commit A — the sweep, whitespace-only.** Nothing but a newline at EOF. **No reformatting, no
   reindenting, no "while I was there."** A whitespace-only diff is reviewable at a glance precisely
   because it contains nothing else; one stray edit makes the whole commit unreviewable.
2. **Commit B — the guard.** It must be a real guard, which in this repo means all four of:
   - lives in **`scripts/guards/`**;
   - added to the **hard-coded `for guard in …` list** in `scripts/guards/run-all.sh` **and** to the
     `run_check` block — **the list is hard-coded, so a guard absent from it never runs at all**;
   - ships a sibling **`.check.mjs`** that **proves the checker fires** on a bad fixture — **and run
     it against the pre-fix state to confirm it would have caught the real thing**, because a guard's
     claim to have found a defect is a claim like any other;
   - the checker is named **`.check.mjs`, never `.test.mjs`** — `npm test` discovers `*.test.mjs`, and
     a top-level `process.exit()` in one kills the whole vitest run.

## 2. `scripts/slice-diff.sh` — so the base is right by construction

**This exists because I made the mistake it prevents.** I diffed slice 2 against `e252f01`, which is
slice 1b's **parent** rather than its tip, then attributed 1b's comment edit to slice 2 and wrote a
false rule into the ledger. **Both SHAs were legitimate ancestors**, so an ancestry check would not
have caught it — the failure was *choosing* the base.

**So the tool must not take a freely-typed base.** It takes a **slice name** and reads the base from
the ledger:

```
scripts/slice-diff.sh <slice-id> [-- <path>...]
```

- Reads **`.scratch/v28/ledger.md`** for that slice's `dispatched (base <sha7>)` line — the line
  written at dispatch time, which is why it is trustworthy.
- Diffs **that base..HEAD**, restricted to the given paths if any.
- **Refuses loudly if the slice has no recorded base** — it must never guess one.
- Prints the resolved range (`base..tip`) in the header, so a wrong choice is visible rather than
  silent.
- Add a short usage note to it, and mention it in `docs/agents/code-structure.md` under how a diff is
  inspected — **the tool is worthless if the next reviewer does not know it exists.**

## 3. The tests that could lie — two specs, both non-vacuous by construction

### a. The Enter guard, and a spec that MEASURES the browser instead of arguing
`ocr` raised a `high` finding: the Continue button is `type="submit"`, so pressing **Enter** in a name
input might implicitly submit the form and **bypass the disabled button**, re-opening the in-flight
orphan window. **Unproven** — my reading of the HTML spec says a disabled *default* button blocks
implicit submission, but that is recollection, not measurement, and it is a browser behaviour that
cannot be settled by reading code.

- **Guard the handler anyway:** `handleCreateProfile` is the true entry point, and gating a form
  submission by disabling a button is fragile. Return early when
  `photoUploadBlocksContinue(photoCrop.busy, photoGateEscaped)`.
- **The spec must be non-vacuous, which means TWO phases:**
  1. **With the upload not in flight, Enter in a name input DOES create the row.** This proves the
     Enter path exists — without it, phase 2 could pass because Enter does nothing at all, and the
     spec would prove nothing.
  2. **With the upload held, Enter creates NO row**, and Continue is still disabled.
- **This is the point of the pair: it converts an argument about a spec into a measurement of the
  browser.** If phase 1 shows Enter never submits, that is a finding worth reporting, not a spec to
  quietly delete.

**⚠️ Copy the existing spec's hold mechanics rather than reinventing them** (`e2e/name-card-photo.e2e.ts`):
a release that lands before the route has captured the request is a **no-op that holds the upload
forever** — hence its `expect.poll` before releasing. Read that comment before writing yours.

### b. The failed-upload path, pinned with a route abort
Review found that the fix's condition — *a FAILED upload must not block Continue* — is **proven
structurally but untested**. Pin it: abort the storage upload (`page.route(..., r => r.abort())`),
confirm the crop, then assert **the card surfaces the error** (`role="alert"`) **and Continue is
ENABLED** **and the row is created**. The reviewer claimed this was not cheaply simulatable; it is.

## 4. Two small honesty fixes in `e2e/name-card-photo.e2e.ts`

- **The duplicated comment paragraph** at the `releaseUpload` block — two drafts of the same
  sentence, both kept. Consolidate, preserving both distinct points (a no-op release fails the spec
  rather than hanging it; the `expect.poll` guarantees the release cannot land before the hold).
- **The redundant transient assertion** `await expect(page.getByText('Uploading…')).toBeVisible()` —
  a label that can be gone before the assertion runs, i.e. flake-prone, and it asserts nothing the
  gate itself does not already assert. Remove it or make it non-transient; **say which you did.**

## 5. `OnboardingPage.tsx` — the one unguarded post-unmount effect

`escapeTimer` is cleared **only** in the callback's `finally`. If the page unmounts while the upload is
in flight, the timer fires into an unmounted component. React 18.3 makes that harmless, but **every
other async effect on this page guards it** (`cancelled` flags; the crop step's own `mountedRef`), so
this is the one place the pattern was dropped for no reason. Keep the timer in a ref and clear it in a
one-shot unmount effect.

## Acceptance

1. Commit A touches **only trailing newlines** — prove it (`git diff --stat` plus a word-diff showing
   no content change).
2. The guard is registered in **both** places, has a `.check.mjs`, and **was run against the pre-fix
   state** to show it catches the real defect.
3. `scripts/slice-diff.sh` refuses a slice with no recorded base, and its output names the range.
4. Both specs: **each demonstrably able to fail** (say how you know), and phase 1 of the Enter spec
   passes.
5. `npm run verify` exits 0; guard count increased by exactly one.

## Verify

`npm run verify` + the two specs, targeted. **Two known flakes — re-run once before reporting either:**
`scripts/guards/no-bypass-guard` (fails under parallel load) and `e2e/places.e2e.ts:2759`. Kill
listeners **by port**, never `pkill -f`.

## Report format

- **Committed as: `<sha7>`** for **each** commit (A and B), or say plainly *"not committed"* and why —
  an absent field is read as evidence.
- Files changed with `+/-` counts; **for commit A, the proof that it is whitespace-only.**
- The `rg`/checker output for each acceptance criterion.
- **The Enter measurement** — what phase 1 actually showed, in its own words. **If Enter never
  submits, say so plainly**; that is a real finding about the product and not a failure.
- Anything the plan did not anticipate — **say it rather than quietly fixing it.**
