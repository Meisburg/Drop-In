SENTINEL: EMPTY-STATE-ONE-BUTTON-M3K7

Slice: the empty state offers ONE action, not four (Jon's design doctrine).
Repo: ~/Projects/playdate-app. Base: HEAD. Do not push.
OWN WORKTREE — fleet-run derives it from THIS FILENAME (/tmp/pd-wt/empty-state-one-button).
Commit on branch empty-state-one-button; never touch main or another lane's path.

## The doctrine (Jon, 2026-10-08, verbatim)
"I'm a minimalist and I don't wanna make the user think... in terms of these four
buttons, I think there should just be one button here, which is like, if the user is
not finding any drop-ins near them, it should just be like, WIDEN THE SEARCH. That's
just one button."

## Work — RadiusEmptyState.tsx (the shared empty state)
Today the feed's empty state renders MULTIPLE controls: the Browse door
(`empty-radius-browse`), the "Create one here" button (`empty-radius-create-here`),
the widen escapes (radiusEscapes → up to 3 buttons), and optionally a post CTA.

Collapse to ONE primary action: **"Widen the search."**
1. Keep exactly ONE control in the feed's render: a widen button that re-queries at
   the next larger radius preset. If more than one escape target exists, pick the ONE
   next step (the immediate next radius up), not the whole ladder.
2. The feed passes the flags that suppress the others (there are already props:
   `showEscapes`, `showPostCta`, `showBrowseCta`, `showCreateHere`). Add/repurpose a
   prop so the feed renders ONLY the single widen control. Browse's caller must be
   left able to make its own choice — do NOT change Browse's render.
3. The honest count line ("Nothing within N miles yet.") STAYS — it is the reason the
   button exists, not a control.
4. The no-zip early return (LocationRequiredNotice) STAYS unchanged.

## What must NOT change
- The shared component's use by Browse (PlaceDirectory.tsx) — its behavior stays.
- The `emptyRadiusCopy` / beyond-count copy seams.
- Every testid the e2e specs assert EXCEPT the ones for controls you remove: update
  those specs in the SAME diff (a removed testid with a stale assertion = stale-locator-guard).

## Acceptance
1. The feed's empty state shows exactly ONE button ("Widen the search"); the other
   controls are not rendered on the feed.
2. Tapping it widens and the count line re-names the new radius (assert the text changes).
3. Browse's empty state is unchanged (its own assertion still passes).
4. No dead control, no duplicate CTA.
5. 390px: no overflow; the single control ≥44px.

## Gate
ALLOW_CONFIG_CHANGE="vite.config.ts: another lane's unstaged dev-only change, not this slice" npm run verify
ALLOW_CONFIG_CHANGE="vite.config.ts: …" npm run guards   # GUARDS: PASS
Then run the affected e2e spec (feed-empty-state.e2e.ts) on a private port 4210-4218.
The gate must be FULLY green — no waivers. Stage BY PATH ONLY (never git add -A).

Report .scratch/empty-state-one-button-report.md, then reply:
Sentinel: EMPTY-STATE-ONE-BUTTON-M3K7
Status: DONE | BLOCKED
Commit: <sha7>
