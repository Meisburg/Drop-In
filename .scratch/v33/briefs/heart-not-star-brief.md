SENTINEL: HEART-NOT-STAR-PLACES-J8N5

Slice: the places save control is a HEART, not a bookmark glyph (Jon's review).
Repo: ~/Projects/playdate-app. Base: HEAD. Do not push.
OWN WORKTREE — derived from THIS FILENAME (/tmp/pd-wt/heart-not-star).
Commit on branch heart-not-star; never touch main or another lane's path.

## The notes (Jon, 2026-10-08)
- `mv0cqvky` (PlaceDirectory ~2081): "I think this should be a HEART instead that you
  click on to heart it."
- `mv0cx8yz` (PlaceMap ~1318): "I want this to be a heart system. It's like how many
  families love this because they've hearted it."

## Work
1. **The save/follow control's glyph → a heart.** Today it is a bookmark-style glyph
   that fills when saved (indigo when followed, slate otherwise), with the accessible
   name flipping Save → Saved. Change the GLYPH to a heart (filled heart when saved,
   outline heart otherwise). KEEP the existing accessible-name flip (Save → Saved) and
   the "more than colour" rule — the pressed state must still be conveyed by the glyph
   AND the name, not colour alone.
2. **Every surface that renders the save control** uses the SAME glyph: check
   PlaceDirectory.tsx (the row control) AND PlaceMap.tsx (the popup panel) so the
   convention is one, not two. Grep for the follow/save control's testid first.
3. **Do NOT build a count.** Jon's PlaceMap note muses about "how many families love
   this" — that is a FOLLOW-COUNT feature (new data), out of scope for this slice.
   State in the report that the count is deferred (needs its own slice + read).

## What must NOT change
- The follow/unfollow write path, the `followedPlaceIds` set, and the pressed-state
  a11y contract (name flips; glyph differs).
- The control's size/position.
- Update any spec that asserts the old glyph's class/svg path in the SAME diff.

## Acceptance
1. The save control renders a heart outline (unsaved) / filled heart (saved).
2. The accessible name still flips Save → Saved.
3. Both PlaceDirectory and PlaceMap use the heart (one convention).
4. No follow-count is added (deferred, stated).
5. No red spec; updated-glyph specs in the same diff.

## Gate
ALLOW_CONFIG_CHANGE="vite.config.ts: another lane's unstaged dev-only change, not this slice" npm run verify
ALLOW_CONFIG_CHANGE="vite.config.ts: …" npm run guards   # GUARDS: PASS
Run the places specs (places.e2e.ts / places-map-view.e2e.ts) on a private port. The gate must be fully green. Stage BY PATH ONLY.

Report .scratch/heart-not-star-report.md, then reply:
Sentinel: HEART-NOT-STAR-PLACES-J8N5
Status: DONE | BLOCKED
Commit: <sha7>
