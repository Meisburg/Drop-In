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

**⚠️ MEASURE THIS YOURSELF WHEN YOU START — do not trust a number in a document.** This count has
**moved four times during planning** (65 → 66 → 79 → 78) because slices kept adding files and fixing
them, including one file this very round was told not to touch. **When this brief was written it was 78:
`src/` 44, `e2e/` 21, `scripts/` 13.** Run the measurement, use **your** number, and if it disagrees with
mine, **yours is right.**

**All of them were verified to be text, so appending a newline cannot corrupt a binary** — re-check that
before you sweep anyway, and if a binary is in your list, **stop and ask** rather than appending.

**And note the whole point: the class has now recurred FOUR times in this batch**, including **twice
inside a fix that was itself curing an earlier instance** — which is what promoted it from "a nit" to "a
guard."

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

## 6. The `useCropStep` await guard, and its own proof

**Context: this class produced a real bug twice in one slice.** Slice 3's builder caught its own draft
calling the confirm wrapper fire-and-forget -- the hook's `finally` then closed the `ImageBitmap` while
the encoder was still reading it, and **the corruption disguised itself as "the chosen area is outside
the image"**, pointing the diagnosis at the crop rect. Then the review found **the same shape still live
in shipped code**: `ProfilePage.tsx:2217/2223` types the upload callback `(...) => void`, and the call
site at `:1373` passes `void handleKidPhotoUpload(...)`. **(Slice 3's fix round is correcting that
instance concurrently -- do not edit those two call sites. Your job is the guard that stops the next
one.)**

**Scope it as a class-shape net, not a closure.** A fresh-context reviewer proposed the guard and was
explicit that it **cannot be total** -- a static check cannot see a lost `await` through arbitrary
indirection. **That is the point: scope it to the shape that actually occurred.** Scan every
`useCropStep(` call site in `src/` and **fail unless the `onConfirm` wrapper body terminates in
`await <expr>` or `return <expr>`** -- a wrapper that merely calls a function (bare, or `void f(...)`)
is the failure. House rules apply: `scripts/guards/`, registered in **both** hard-coded places in
`run-all.sh`, with a `.check.mjs` that proves it fires, named `.check.mjs` and never `.test.mjs`.
**Prove it against the real instance**: `ProfilePage.tsx` as it stands **before** fix round 1 is a true
positive it must catch. If fix round 1 has already landed when you start, **build the fixture from the
shape** rather than pointing at a file that no longer exists -- and say which you did.

**And make the failure LOUD in the guard's blind spots** -- a diagnostic change in the crop step: a
closed or `0×0` `ImageBitmap` reaching the encode should raise its own message naming the cause, e.g.
*"the crop step released the bitmap before the upload finished -- the confirm wrapper did not await its
work"*, **instead of the current "the chosen area is outside the image."** **That misdiagnosis is what
hid the bug for a whole build cycle, and a wrong error message costs more than a missing one.**

## 7. Five small honesty fixes slice 3's fix round left behind

A fresh-context reviewer passed the fix round and named these. **All five are comment/test-honesty items,
which is this half's business.**

- **The spec header overstates what its tests prove.** `e2e/onboarding-kid-photo.e2e.ts`'s header
  attributes an in-flight-attach guarantee to test 4. **Measured: test 4 PASSES ON THE PRE-FIX CODE** —
  in the driven sequence the dialog is closed and the lock released before the single removal, so no write
  is in flight then, and the old index-keyed filter landed correctly anyway. It is a **state-invariant
  pin, not a discriminator**. Correct the header to say what the test actually pins — the commit message
  already says it honestly, so this is the last place the claim is overstated. **Do not delete the test**;
  it can still fail on a regression.
- **`useCropStep`'s `onConfirm` param still admits `| void`** (`src/components/useCropStep.tsx:27`).
  **Drop the `| void`.** This is the reviewer's "one increment worth having" instead of a signature
  rework. *(The reviewer also established that a signature change CANNOT work: `async (s, r) => { onUpload(id, s, r) }` is TYPE-IDENTICAL to the awaited version — both return `Promise<void>` — so no signature can force an internal `await`. The guard is the only mechanism that can fail. **Do not rework the signature.**)*
- **TWO `eslint-disable-next-line react-hooks/exhaustive-deps` comments guard ONE memo**, and one is
  inert. **Determine which by removing, not by line number** — the two lanes disagreed about the location
  and one of them was wrong. The rule reports on the **dependency-array line**, so the disable **above
  `useMemo`** is the inert one and the one **above the deps array** is load-bearing. Remove the inert one
  **and leave the warning count at the 81 baseline** — if removing it moves the count, you removed the
  wrong one.
- **`e2e/onboarding-kid-photo.e2e.ts` now ends `)\n\n`** (an extra blank line): the fix round repaired a
  newline it had been told not to touch. Normalise it as part of the sweep.
- **A flake window in the F3 test:** after its fixed 800 ms sleep, the final `src`-equality assertion can
  race a late-settling post-add mint on a slow machine. **Wait for the `src` to change (or for stability)
  before opening the keystroke window.** A new spec that can flake is worth closing now, before the
  batch-end full sweep is the thing that discovers it.

## Acceptance

1. Commit A touches **only trailing newlines** — prove it (`git diff --stat` plus a word-diff showing
   no content change).
2. The guard is registered in **both** places, has a `.check.mjs`, and **was run against the pre-fix
   state** to show it catches the real defect.
3. `scripts/slice-diff.sh` refuses a slice with no recorded base, and its output names the range.
4. Both specs: **each demonstrably able to fail** (say how you know), and phase 1 of the Enter spec
   passes.
5. `npm run verify` exits 0; guard count increased by **two** (the newline guard and the await guard).
6. The await guard catches the real `ProfilePage.tsx` instance (or a fixture of its exact shape), and its
   `.check.mjs` proves it can fail; the closed-bitmap path names its own cause instead of blaming the
   crop rect.
7. Item 7's five honesty fixes land, **and the warning count is still 81** — removing the spurious
   disable must not move it in either direction.

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
