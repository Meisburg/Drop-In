SENTINEL: REMOVE-BUTTONS-MINIMALISM-R7T4

Slice: remove the four controls Jon flagged (his minimalism doctrine).
Repo: ~/Projects/playdate-app. Base: HEAD. Do not push.
OWN WORKTREE — derived from THIS FILENAME (/tmp/pd-wt/remove-buttons).
Commit on branch remove-buttons; never touch main or another lane's path.

## The doctrine
"I'm a minimalist and I don't wanna make the user think." Several surfaces carry a
control that does not earn its place. Jon named four.

## Work — remove exactly these, nothing else
1. **NewPlaydatePage.tsx (~line 1149)** — the "vibe chips" block (`data-testid="vibe-chips"`,
   `vibe-chip`). `mv0cjnlq`: "I don't like these buttons here... remove it."
2. **InboxPage.tsx (~line 1325)** — the `Link to="/browse"` button shown in the empty
   inbox state. `mv0chug7`: "It doesn't make sense to have this button here."
3. **SettingsPage.tsx (~line 109)** — the `settings-profile-link` row. `mv0d7zlm`:
   "Remove from here." (Settings already routes to profile elsewhere; this is the
   redundant one. Confirm before deleting that /profile is reachable from Settings by
   another door — if this is the ONLY door, STOP and report BLOCKED with that finding.)
4. **ProfilePage.tsx (~line 1329)** — the interests block that duplicates the parent
   interests section below. `mv0d4ugk`: "Isn't this redundant because there's an
   interest part for the parents below?" Remove the DUPLICATE, keep the canonical one.

## What must NOT change
- The four target controls only. Do not "tidy" neighboring UI.
- Any behavior those controls triggered that is reached another way (documented above).
- Update any spec whose locator names a removed testid, in the SAME diff.

## Acceptance
1. The vibe-chips block is gone; the rest of the /new form is unchanged.
2. The empty inbox renders no browse button (its copy line may stay or go, your call —
   state which in the report).
3. The settings profile row is gone; /profile is still reachable from Settings (or
   BLOCKED).
4. The duplicate interests block is gone; the canonical interests section remains.
5. No new red spec; removed-testid specs updated in the same diff.

## Gate
ALLOW_CONFIG_CHANGE="vite.config.ts: another lane's unstaged dev-only change, not this slice" npm run verify
ALLOW_CONFIG_CHANGE="vite.config.ts: …" npm run guards   # GUARDS: PASS
Run any e2e spec that referenced a removed testid. The gate must be FULLY green — no waivers.
Stage BY PATH ONLY.

Report .scratch/remove-buttons-report.md, then reply:
Sentinel: REMOVE-BUTTONS-MINIMALISM-R7T4
Status: DONE | BLOCKED
Commit: <sha7>
