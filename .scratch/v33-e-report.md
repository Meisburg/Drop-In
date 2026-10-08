# v33-E report — a brand-new profile gets no first-run orientation

**Sentinel:** V33-E-FIRST-RUN-AFTER-SIGNUP-H8P2
**Worktree:** `/tmp/pd-wt/v33e` on branch `v33e` (base `5c97c5a`)
**Founder report:** `muzkh36s`, anchored on `/` — *"I just tested making a new
profile and after I clicked finish to come to the feed I landed on this page but
I didn't see the orientation where I have the tooltips…"*

---

## 1 — THE CAUSE, in one sentence

**The shared first-run dismissal fact is `sessionStorage` — per TAB and shared
with the resume nudge — so a brand-new profile created in a tab that had already
stood a first-run surface down inherited that dismissal and was never taught the
tour.**

## 2 — Reproduction (private port 4210, marker minted there)

Probe: `e2e/zz-v33e-repro.e2e.ts` (throwaway, deleted before the commit). Each
leg is one measured line; the number is the finding.

```
REPRO leg1 fresh-tab, fresh viewer, onboarding done   : tour=VISIBLE  dismissedKey=null
REPRO leg2 used tab, dismissal key pre-set            : tour=ABSENT   dismissedKey="1"
REPRO leg3 same tab, key cleared before the walk      : tour=VISIBLE  dismissedKey=null
REPRO leg4 profile home_zip cleared, armed entry load : tour=ABSENT   (REST 200, row read back)
```

| # | Condition | Tour | What it proves |
|---|---|---|---|
| 1 | fresh tab, fresh viewer | **VISIBLE** | the defect is not universal — a cold tab is taught |
| 2 | used tab (`FIRST_RUN_DISMISSED_KEY` set) | **ABSENT** | **the founder's path, reproduced** |
| 3 | same tab, key cleared | **VISIBLE** | the per-tab fact is necessary and sufficient |
| 4 | profile with no `home_zip` | **ABSENT** | the ZIP clause is real, but not the cause here |

Leg 2 versus leg 3 is the whole finding: with every other fact held identical,
the presence of the per-tab key is the only difference between "no tour" and
"tour". Leg 4 confirms `homeZipSet` also closes the gate — but the founder's walk
**requires** the area card (the ZIP write is how the run finishes), so on his path
the ZIP was never the cause. Per §4 of the contract, the measured cause wins: I
cleared the fact and did not touch the ZIP gate.

**Why the existing spec could not catch this.** `e2e/first-run-tooltips.e2e.ts`
opens a **fresh browser context per leg** (`signUpAndFinishRun` →
`browser.newContext`), so `sessionStorage` always starts empty. The suite was
green because its shape could not express "a used tab" — the spec's shape is the
reason the defect shipped.

## 3 — The fix

One clear, in a `lib/` seam, on the profile-creation path.

- **`src/lib/firstRunTooltips.ts`** — new `clearFirstRunDismissed(storage)`
  (injected `removeItem`, best-effort try/catch, matching the existing
  `read`/`mark` helpers). No new storage layer, no per-profile key.
- **`src/pages/OnboardingPage.tsx`** — `handleCreateProfile` calls
  `clearFirstRunDismissed(window.sessionStorage)` immediately **after**
  `createProfile` resolves and **before** `refresh()`. Clearing only on success
  means a failed write never touches the tab's fact. The page renders; the lib
  decides (build law).

Preserved, deliberately:

- A parent who dismisses the tour is still not shown it again this session
  (the clear runs only at profile creation).
- A reload of the armed entry after a dismissal is still quiet.
- The veil still passes taps through, and the nudge's semantics are unchanged
  beyond the clear.

### The measured ZIP note

`homeZipSet` is a real clause of the gate (`hasHomeZip(profile.home_zip)`), and
leg 4 shows it closes the tour. It is **not** the defect: finishing the first run
requires the area card, which writes the ZIP. No change was made to it.

## 4 — Acceptance criteria

| # | Criterion | Evidence |
|---|---|---|
| 1 | Repro numbers quoted; cause in one sentence | §1, §2 |
| 2 | Fresh viewer completing onboarding sees the tour | `first-run-tooltips.e2e.ts` leg "a brand-new profile is taught even in a tab that dismissed earlier (v33-E)" — **passes** |
| 3 | Already-dismissed session still does not see it | new leg "an already-dismissed session is still not taught on the next load (v33-E)" — **passes** |
| 4 | Reload-of-armed-entry behaviour still holds | original leg 1 ("the second load is quiet") — **passes** |
| 5 | A `lib/` test names the defect and mutation-proves the fix | `firstRunTooltips.test.ts` → "a brand-new profile is undismissed even in a tab that dismissed before" |
| 6 | `npm run verify` green | §5 below |
| 7 | `e2e/first-run-tooltips.e2e.ts` passes on the private port | 7/7 passed on 4210 |
| 8 | Diff touches only sanctioned paths | §6 below |

### Mutation proofs (both layers)

1. **Unit.** Made `clearFirstRunDismissed` a no-op → the defect-naming test goes
   red: `38 tests | 1 failed` (`× a brand-new profile is undismissed even in a tab
   that dismissed before`). Restored → `38 passed`.
2. **e2e.** Removed the clear call from `handleCreateProfile` and rebuilt → the
   new v33-E leg **fails** (no tour for the new profile) while the control leg
   passes: `1 failed | 2 passed`. Restored → **7 passed**.

The e2e mutation is the point of §3 of the contract: the spec's shape now
expresses the used-tab session that the old shape could not.

## 5 — The gate (`npm run verify`, `ALLOW_CONFIG_CHANGE=1`)

```
VERIFY_EXIT=0
build        ✓
typecheck:e2e ✓
test         ✓  92 files / 2708 tests passed  (was 2705; +3 new)
lint         ✓  88 warnings, 0 errors
a11y:focus   ✓  PASS — every control that suppresses its outline provides a focus cue
steering-lint ✓ PASS — steering layer is clean
guards       ✓  GUARDS: PASS — all deterministic rules hold
```

Note on steering-lint: this run reported **PASS with no external
`docs/agents/*` findings** (the brief anticipated external findings; none
appeared). Nothing outside my sanctioned paths was touched either way.

## 6 — Diff scope

```
 e2e/first-run-tooltips.e2e.ts    | 83 +++++++++++++++++++++++++-
 src/lib/firstRunTooltips.test.ts | 51 ++++++++++++++++
 src/lib/firstRunTooltips.ts      | 32 ++++++++++
 src/pages/OnboardingPage.tsx     | 11 +++++-
 4 files changed, 175 insertions(+), 2 deletions(-)
```

Only the lib seam + sibling test, the completion path, and the spec.
`vite.config.ts`, `src/dev/AgentationDev.tsx`, `CONTEXT.md`, `docs/agents/*`
untouched. Staged by path only; nothing pushed.

## 7 — Pre-existing failures (not claimed)

`feed-empty-state.e2e.ts:301`, `places.e2e.ts:2655`, and the flake
`places-map-view.e2e.ts:730` were not run and are not claimed.

## 8 — What the founder can try

Create a new profile in the same tab you have been reviewing in all day, click
Finish on the area card, and land on the feed: the tour is there, step 1 ringing
the Drop Ins tab. Dismiss it and reload — it stays down for that session.
