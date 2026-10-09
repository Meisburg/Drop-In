SENTINEL: V33-E-FIRST-RUN-AFTER-SIGNUP-H8P2

**Slice v33-E (`muzkh36s`) — a brand-new profile does not get the first-run
orientation.** Diagnosis first, then the fix. Reproduce, name the cause, fix it.

Repo: `~/Projects/playdate-app`. Base: HEAD (whatever the browse slice left; check
`git log`). **Do not push.** Work economically — this is the ONE local lane (~98k).

Report to **`.scratch/v33-e-report.md`**. Reply with only:

```
Sentinel: V33-E-FIRST-RUN-AFTER-SIGNUP-H8P2
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v33-e-report.md
```

---

## 1 — The founder's report, verbatim

> *"I just tested making a new profile and after I clicked finish to come to the
> [feed] I landed on this page but I didn't see the orientation where I have the
> tooltips and it walks me through all the like what the app is and how to use it."*
> — `muzkh36s`, anchored on `/`

## 2 — What is measured already (do not re-derive)

The tour's gate is `shouldShowTooltips` (`src/lib/firstRunTooltips.ts:223`):

```ts
return facts.signedIn && facts.homeZipSet && facts.armed && !facts.dismissed
```

- `armed` comes from `history.state` on the run's arrival (`FeedPage.tsx:278`,
  `isFirstRunTooltipsArmed(location.state)`) and survives a reload of that entry.
- `dismissed` is **`sessionStorage`** under
  `FIRST_RUN_DISMISSED_KEY = 'dropin.first-run.nudge-dismissed'`
  (`firstRunTooltips.ts:47`) — **per tab**, and its docblock says the nudge and the
  tour share **one** fact.

**The prime suspect:** the founder has been reviewing this app in the **same tab**
all day, so that session fact is already written — and it is **shared with the
nudge**, so any earlier interaction that stood the nudge down also stands the tour
down. A brand-new profile in a used tab therefore gets no orientation, which is
exactly what he saw. **Confirm or kill it by measurement, do not assert it.**

## 3 — Step 0: REPRODUCE, and record what you saw

On a private port you own (**4210–4218**, kill by port/PID — never `pkill -f`),
sign up a **fresh viewer** and walk the onboarding to the end. Then measure, in
this order, and quote each:

1. Fresh tab, fresh viewer, onboarding completed → **does the tour appear?**
2. Same tab, with `sessionStorage['dropin.first-run.nudge-dismissed']` set
   **before** the walk → does it appear?
3. Same tab, that key cleared → does it appear?
4. A viewer whose onboarding **skipped the ZIP step** (`homeZipSet` false) → does it
   appear? (This is the other live suspect: the gate requires a home ZIP.)

Whichever of those is the actual cause, its number is the finding. There is an
existing spec, `e2e/first-run-tooltips.e2e.ts` — it signs up its **own** viewer per
leg, so **it cannot have caught this**; say so in the report if that is what you
find, because it means the spec's shape is the reason the defect shipped.

## 4 — The fix (the shape is pinned; the mechanism is yours)

**A brand-new profile must get the orientation, exactly once.**

- The dismissal fact is a **per-tab, cross-surface** fact today. A newly created
  profile must start **undismissed**: clear the shared first-run fact at the point
  a profile is **created/onboarding completes**, so the new parent's first landing
  on the feed is taught.
- Keep the existing behaviour that matters: a parent who dismisses the tour is not
  shown it again in that session; a reload of the armed entry still shows it; the
  veil still passes taps through; the nudge's own semantics do not change beyond
  the clearing.
- **No new storage layer, no per-profile key migration.** One clear on the
  completion path, in a `lib/` seam with a sibling test (the build law: React
  renders, `lib/` decides).
- If the measurement shows the **ZIP gate** is the cause instead, say so and fix
  the real one — do not clear a flag that was not the problem. **The measured cause
  wins over this section.**

## 5 — Acceptance criteria

1. The reproduction numbers from §3 are quoted, and the report names the cause in
   one sentence.
2. A fresh viewer who completes onboarding **sees the tour on the feed** — asserted
   by a spec that signs up its own viewer (the shape the existing spec uses).
3. An already-dismissed session still does **not** see it (unchanged) — its own
   assertion, so the fix is a widening and not a removal.
4. The reload-of-the-armed-entry behaviour still holds.
5. A new `lib/` test names the defect it detects (a new profile inheriting a used
   session's dismissal) and **mutation-proves** the fix (remove the clear → red).
6. `npm run verify`: build ✓, typecheck:e2e ✓, test ✓ (**92 files / 2705 tests**,
   growing), lint ✓ (**0 errors**), a11y:focus PASS ✓, steering-lint ✗ **only** with
   the external `docs/agents/*` findings (another lane's; **do not touch**), and
   `npm run guards` (with the `ALLOW_CONFIG_CHANGE` waiver) → **GUARDS: PASS**.
   Any other failure = stop, BLOCKED.
7. `e2e/first-run-tooltips.e2e.ts` passes on your private port (marker minted there).
8. `git diff` touches only the lib seam + its test, the completion path, and the
   specs you add/adjust.

## 6 — Landmines

Stage **by path only**; never `git add .`/`-A`. Never stage, revert or edit
`vite.config.ts`, `src/dev/AgentationDev.tsx`, `CONTEXT.md`, `docs/agents/*`.
Pre-existing failures never to claim: `feed-empty-state.e2e.ts:301`,
`places.e2e.ts:2655`, the flake `places-map-view.e2e.ts:730`. Ambiguous or blocked
→ `Status: BLOCKED` with the one question.
