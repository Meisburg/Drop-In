# v33-7b report — the Start/End control as ONE window (`muyefjzq`, polish half)

SENTINEL: V33-7B-WINDOW-CONTROL-M6R3
Status: DONE
Commit: `36bf451` on branch `window-control-m6r3`
Worktree: `/tmp/pd-wt/window-control-m6r3`

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

**e2e, private port 4215** (4210 and 4213/4214 were held by other lanes):

| Spec | Result |
|---|---|
| `post-fast.e2e.ts` (incl. the new v33-7b spec and v33-7a) | **8 passed** |
| `post-edit-delete.e2e.ts` | **7 passed** |
| `golden-path.e2e.ts` + `address-maps.e2e.ts` | **5 passed** |
| `post-again`, `comments`, `reactions` | passed |

**One pre-existing failure, measured at base, not mine.**
`rsvp-confirmation.e2e.ts:199` and `:598` time out waiting for
`input[autocomplete="given-name"]` during signup. I stashed my changes and ran
`:199` at the pristine base: it fails identically. Recorded, not fixed — outside
this slice.

**A trap worth recording.** My first e2e run "failed" on `window-section count 0`
because Playwright's `reuseExistingServer` found another lane's `vite preview`
squatting on port 4210 (`/tmp/pd-wt/place-pills-p5l9`) and served **its** build.
The port was logged free by `ss` moments earlier and taken by the time the run
started. Fixed by moving to a port no other lane held. The repo's own config warns
about exactly this; on a machine with five concurrent lanes it is the default
outcome, not an edge case.

## 7. Nothing else changed

`git diff` is 5 files, all named in §3. The `/edit` and location-first branches
render the same markup as before — verified by their specs passing and by
inspection of the staged diff (the only removed markup lines are the old
branch-1-only `endBlock`, folded into `whenBlock`).

Nothing was pushed. Branch `window-control-m6r3` at `36bf451`.
