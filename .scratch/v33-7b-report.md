# v33-7b report — the Start/End control as ONE window (`muyefjzq`, polish half)

SENTINEL: V33-7B-WINDOW-CONTROL-M6R3
Status: DONE
Commit: `36bf451` (the slice) on branch `window-control-m6r3`; the report and its
verification passes are `2aed972`, `bab9b5a`, `5478b44` and the commit carrying
this section
Worktree: `/tmp/pd-wt/window-control-m6r3`

> **Resumed run.** This slice's work was already committed (`36bf451`) when the
> session resumed; nothing was re-done. The resume **re-verified** the committed
> state instead of trusting the earlier run: full `npm run verify` → exit 0,
> `GUARDS: PASS`, `feed.test.ts` 436 passed, the three post specs 14 passed, and
> the silent-drag defect **mutation-proved** by re-introducing the old handler
> (3 tests red). Sections §5, §6 and the new §6b record that verification and the
> corrections it made to this report.

---

## 1. The defect being removed: a silent drag

The brief scopes the work to `/new` (branch 1). At the base commit the Start
stepper was:

```tsx
onStep={(delta) => onFieldChange('startMinutes', stepTimeMinutes(values.startMinutes, delta))}
```

The form's model is `{ startMinutes, durationMinutes }` with
`endTotal = start + duration`. Writing **only** `startMinutes` and leaving
`durationMinutes` alone means the **END moves with the START**: stepping the start
of a 2–3 PM window by +30 silently produced 2:30–3:30. The parent moved one end
and both moved, with nothing on screen saying so — exactly the "linked together"
the founder rejected:

> *"I don't want them to be linked together because people can make it as long or
> as short as they want it to be."*

This was a real defect that **no existing spec could catch**: the old code
preserved the window's LENGTH, so any assertion of the form
`end − start === 60` passed both before and after. My first draft of the new spec
made precisely that mistake; §5 records how it was found and fixed.

## 2. The fix

**`src/lib/feed.ts` — `stepWindowEnd(window, which, delta)`**, a pure seam beside
`stepTimeMinutes`, plus `MIN_WINDOW_MINUTES` (30) and the `WindowStepResult` type.

- Step the **START** → the start moves, **the end does not**. The length is free.
- Step the **END** → the end moves, the start does not.
- The only coupling left is the invariant: a step that would break `end > start`
  moves the **other** end to preserve `MIN_WINDOW_MINUTES` and returns
  `otherEndMoved: true`.
- A degenerate input window (`end <= start`) is repaired to the minimum rather
  than blessing a 23.5-hour window through the modulo — found by my own test, see
  §5.

The invariant is enforced **in the lib**, not at the call site, so the component
never re-derives window arithmetic (the repo's one-copy rule).

**`src/components/PlaydateFormFields.tsx`**

- Branch 1 renders one `data-testid="window-section"`: a single "When" heading, the
  date, and both steppers as the two ends of one answer.
- The start control is the **one** `startBlock`, which now takes its step rule as
  an argument (`onStartStep`). `/new` passes the window rule; branches 2/3 pass
  the original handler. One copy of the control, two rules — so the branch
  families cannot drift.
- A one-line note (`data-testid="window-adjusted-note"`) renders only when
  `otherEndMoved` — so the guard is announced, never silent. It states what
  *just happened* ("Kept the other end at least 30 minutes away."), never what the
  length may be.
- Branches 2/3 (`/edit`, the location-first page) keep `durationBlock` and the
  pre-v33-7b start step verbatim.

## 3. Acceptance, and how each is proven

| AC | Evidence |
|---|---|
| 1 — one window at 390px | One `window-section`; a single "When" heading over it; both steppers' boxes inside the section's own box; 44px on all four ± buttons. Asserted in the new v33-7b spec. |
| 2 — a step never silently drags; the note says so | **Stepping the start leaves the END byte-identical** (`expect(endAfter).toBe(mountedEnd)`), and no note. Then stepping the start into the end keeps ≥30 min **and the note is visible with its text**; and the ordinary case asserts the note is **absent**. |
| 3 — a 30-minute window is still postable | `post-fast.e2e.ts:550` (v33-7a) passes: it steps End earlier to 30 min, posts, and reads `start_at`/`ends_at` back from the live row, asserting a `1800000` ms span. My change does not touch that path. |
| 4 — no copy implies a fixed length | The spec asserts **absence** of `How long`, the `1h` chip, and any `/^Ends /` line on `/new`. |
| 5 — `/edit` unchanged | `post-edit-delete.e2e.ts` **7/7 pass**. Its diff is confined to expectations that encoded the removed coupling (§4). |
| 6 — scope | `git diff` = 5 files: the lib seam + its sibling test, the component, and the two specs. Testids preserved (`end-time-label`, `start-time-label`, `Earlier/Later start|end time`). |

## 4. Two spec changes that were forced, not chosen

Both were **passing at base and failing with my change**, so they are not
cosmetic — and per AC 6 they had to move in the same diff.

**`post-edit-delete.e2e.ts` computed the end as `startMinutes + 60`.** That
arithmetic *is* the coupling: it assumed the start step dragged the end. With the
drag removed, the same posted window is 30 minutes, so the sum names a time the
form never posted. The helper now **reads the end label the form rendered** and
returns it — describing what the form did rather than restating a rule about how
the two ends relate.

**The `/edit` prefill no longer shows the `1h` chip pressed.** That was a
second-order effect: the helper's start step now yields a 30-minute post, and no
chip represents 30 minutes (the chips are 1h/1.5h/2h/3h — a free length is
v33-7a's point). Pinning `1h` would pin the coupling back. The assertion is now a
**stronger** one — exactly zero chips pressed, which is the truthful state — and
the real read-back (`Ends …`) is unchanged and still exact.

## 5. How the vacuous assertion was found (and the two real bugs behind it)

The brief's own batch history names *"an acceptance test that cannot fail"* as the
recurring defect class. My first draft fell into it, and the red-green run is what
caught it.

**Draft 1 asserted `length survives a start step`.** I re-introduced the old
silent-drag handler, ran the spec, and it **passed** — because the old code
preserves the length too. The assertion proved nothing. The claim that can fail is
*the END did not move*, which is what the spec asserts now. Re-run against the bug,
it **fails**: `the END must not ride along with the start`, expected 660, received
690.

Writing the sibling test also surfaced **two real bugs in my own seam**, both
caught by cases I nearly did not write:

1. **Degenerate input** (`end === start`). The modulo reported a near-full-day
   "forward" distance, so the helper returned a **1410-minute** window — silently
   blessing the state the rule exists to forbid. Fixed with an explicit
   invalid-window guard.
2. **Cross-midnight start step.** My first expectation was wrong, not the code:
   stepping a 11:30 PM → 12:30 AM window's start back keeps the end at 12:30 AM
   (90-minute window). Corrected the test to the true behaviour.

## 6. Gate and e2e evidence

```
ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only
server.host change (another session), not this slice" npm run verify
→ exit 0
  build ✓, typecheck:e2e ✓, 2715 tests / 92 files ✓ (10 of them new),
  oxlint 0 errors (88 pre-existing warnings), a11y:focus PASS,
  steering-lint PASS, GUARDS: PASS — all deterministic rules hold
```
The expected `steering-lint` red naming another lane's `docs/agents/*` **did not
appear**; steering reported clean. No guard regressed.

**e2e, private port 4211** (4210, 4213 and 4218 were held by other lanes):

| Spec | Result |
|---|---|
| `post-fast.e2e.ts` (incl. the new v33-7b spec and v33-7a) | **8 passed** |
| `post-edit-delete.e2e.ts` | **7 passed** |
| `golden-path.e2e.ts` + `address-maps.e2e.ts` | **5 passed** |
| `post-again`, `comments`, `reactions` | passed |

**One pre-existing failure, measured at base, not mine.**
`rsvp-confirmation.e2e.ts` — "an RSVP raises one lightbox, Escape closes it, and
it never comes back for that yes" — fails on **`confetti pieces must stay inside
the dialog`**, a confetti-animation geometry assertion with no connection to the
start/end stepper. Re-measured on resume: the same test fails with my five files
`git stash`ed at the pristine base, identically. (An earlier draft of this report
named a *different* symptom — a `given-name` signup timeout at `:199`/`:598` —
which the resumed run did not reproduce; the failure recorded here is the one
actually measured at base.) Recorded, not fixed — outside this slice.

**A trap worth recording.** An early e2e run "failed" on `window-section count 0`
because Playwright's `reuseExistingServer` found another lane's `vite preview`
squatting on port 4210 (`/tmp/pd-wt/place-pills-p5l9`) and served **its** build.
The port was logged free by `ss` moments earlier and taken by the time the run
started. Fixed by moving to a port no other lane held (4211). The repo's own
config warns about exactly this; on a machine with five concurrent lanes it is
the default outcome, not an edge case.

## 6b. ⚠️ This worktree is being written by a SECOND lane

The brief says this path is this slice's alone. It is not. On resume the working
tree gained **another lane's uncommitted work** — `src/lib/onboardingCompletion.ts`
(+ its sibling test), `e2e/onboarding-finish-transition.e2e.ts`, and edits to
`scripts/guards/copy-field-consumption-guard.*`, `src/lib/firstRunCopy.ts`,
`src/pages/OnboardingPage.tsx` (the onboarding-Finish slice, `muzkg290`).

Nothing of theirs was lost: their files are present and complete, the guard
script parses, and the whole tree typechecks. But **this slice's own work was
already committed before the resume began** (`36bf451`), so no stash or reset was
ever needed — and the one `git stash`/`pop` cycle the resume performed (to
re-measure the `rsvp-confirmation` failure at base) briefly lifted their
uncommitted files out of the tree and put them back. Net effect: zero loss, but
it was avoidable, and **no further tree operations were made after that cycle.**

Verified on resume, against `HEAD`:

- the five slice files match `36bf451` **exactly** (`git diff HEAD` empty for them);
- `src/lib/feed.test.ts` **436 passed**;
- `e2e/auth.setup.ts` + `post-fast.e2e.ts` + `post-edit-delete.e2e.ts`
  **14 passed**, exit 0.

## 7. Nothing else changed

`git diff` against `0df3dfe` is 5 files, all named in §3. The `/edit` and
location-first branches render the same markup as before — verified by their
specs passing and by inspection of the staged diff (the only removed markup lines
are the old branch-1-only `endBlock`, folded into `whenBlock`).

Nothing was pushed. Branch `window-control-m6r3` (`36bf451` the slice, `2aed972`
this report, `bab9b5a` the resume verification, and the commit carrying this
section).

## 6c. Independent corroboration on a CLEAN checkout of the committed state

A third session re-ran the whole gate and both specs against the **committed**
tree, from a throwaway detached worktree at `2aed972` — deliberately **not** the
shared path, because §6b's foreign edits were still sitting in it and would have
made the run unreadable.

**Why a separate checkout was required — `GUARDS: FAIL` is 100% the other lane.**
Running `npm run verify` in the shared worktree exited **1** with
`GUARDS: FAIL — copy-field-consumption-guard`, 9 sub-checks red on
`firstRunCopy.ts: "FIRST_RUN_COMPLETION_COPY" … the instrument is blind on it`.
Measured against the two trees:

| tree | `copy-field-consumption-guard.mjs` `consts:` | guard result |
|---|---|---|
| `HEAD` (`2aed972`, this slice) | `['FIRST_RUN_COPY', 'FIRST_RUN_NUDGE_COPY']` | **PASS** |
| shared worktree (other lane's uncommitted edit) | `[…, 'FIRST_RUN_COMPLETION_COPY']` | **FAIL** |

`FIRST_RUN_COMPLETION_COPY` does not exist anywhere in this slice's commits
(`git show HEAD:src/lib/firstRunCopy.ts | grep -c` → 0), and this slice touches
none of those files. The failure is the onboarding-Finish lane's half-finished
guard config, not v33-7b.

**On the clean checkout (`/tmp/pd-wt/wc-verify-m6r3` @ `2aed972`, then removed):**

| Check | Result |
|---|---|
| `npm run verify` (with the config waiver) | **exit 0** — 92 files / **2715 tests**, oxlint **0 errors** (88 warnings), a11y:focus PASS, steering-lint PASS, **GUARDS: PASS** |
| `post-fast.e2e.ts` (private port **4216**) | **8 passed** — incl. the v33-7b leg and v33-7a's 30-minute post |
| `post-edit-delete.e2e.ts` (same port) | **7 passed** — `/edit` unchanged (AC5) |
| `src/lib/feed.test.ts` | **436 passed** (10 new) |

**The drag was mutation-proved a second time, independently.** Re-introducing the
pre-v33-7b handler (end rides along, length preserved) in `stepWindowEnd` and
re-running: `× THE SILENT DRAG: stepping the START moves the START and leaves the
END` — **1 failed**, restored immediately after. The assertion is load-bearing,
not vacuous.

**Note on §6b's account.** The foreign files were not merely lifted by a stash
cycle: during the resumed window the onboarding-Finish lane was **actively running
Playwright in this same worktree** (`playwright test e2e/auth.setup.ts
e2e/post-fast.e2e.ts e2e/post-edit-delete.e2e.ts` on port 4211, plus its own
`onb-finish-transition` run). That is the mechanism by which the foreign edits
appeared and kept re-appearing. Their work is intact and uncommitted; nothing of
theirs was reverted.

## 6d. Third resume — re-verified again at the current HEAD, nothing re-done

The slice was already fully committed when this session resumed, so **no work was
re-done**; this pass re-ran the checks against the committed tree to confirm the
green still holds at `5478b44`, and to confirm for itself what §6c reported.

**A clean checkout was again required, and for the same reason.** The shared
worktree still carries the onboarding-Finish lane's uncommitted edits
(`firstRunCopy.ts`, `OnboardingPage.tsx`, both `copy-field-consumption-guard`
files, plus untracked `onboardingCompletion.*` / `onboarding-finish-transition`).
Running the gate there would measure their half-finished work, not this slice —
§6c's `GUARDS: FAIL` exactly. So this run used a throwaway detached worktree at
`5478b44` and removed it afterwards.

```
verify (clean checkout, detached at 5478b44) → exit 0
  build ✓, typecheck:e2e ✓, 2715 tests / 92 files ✓, oxlint 0 errors
  (88 pre-existing warnings), a11y:focus ✓, steering-lint PASS, GUARDS: PASS
```

**e2e, private port 4216** (`auth.setup` + both specs): **14 passed, exit 0** —
post-edit-delete 7/7, post-fast 7/7 including the new v33-7b spec. The two
behavioural proofs, quoted from the run's own log rather than restated:

```
[e2e v33-7a] live row: start_at=2026-10-08T17:30:00+00:00 ends_at=2026-10-08T18:00:00+00:00 span=30min
[e2e v33-7b] mount 630→690 (60min); after a start step 660→690 (end UNMOVED, 30min, no note);
             after stepping the start into the end 690→720 (30min, note shown)
```

That is AC 3 (a 30-minute window still posts and reads its exact span back) and
AC 2 (an ordinary start step leaves the END byte-identical and shows no note; a
collision keeps the 30-minute minimum and **shows the note**) in one line each.

**Port hygiene:** 4216 verified free before the run and released after
(`ss -ltn` clean); the temporary worktree was removed with
`git worktree remove --force`. Nothing was pushed.

