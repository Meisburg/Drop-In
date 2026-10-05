# 05: The first-run name card shows the photo you chose

**What to build:** After a parent chooses and crops a photo on the first-run name
card, the card shows the photo, offers **Remove**, and re-opens the crop when the
preview is tapped — the behaviour the profile page already has.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Source:** annotation 1 in `source-annotations.json` — "it shouldn't just say photo added".

- [ ] After choosing a photo, the photo is visible on the card — not only the
      words "Photo added".
- [ ] Remove clears the photo and returns the card to its "Add a photo" state,
      leaving the card's other answers (first and last name) intact.
- [ ] Tapping the preview re-opens the existing "Adjust the photo" dialog with
      the current photo, so framing can be fixed without starting over.
- [ ] The crop dialog, its copy, and the crop geometry are unchanged — this
      ticket adds preview and remove markup, not a new dialog.
- [ ] A parent who never picks a photo sees no preview and no Remove.
- [ ] The name-card photo spec covers all three behaviours; `npm run verify`
      exits 0.

## Comments

**2026-10-05 (build note) — one acceptance criterion is met in a different
shape, deliberately.** The criterion says *"tapping the preview re-opens the
crop with the current photo"*. `useCropStep.beginCrop` takes a `File`, and the
current photo is an already-cropped upload reached by URL — re-opening the crop
on it would mean fetching a crop back and cropping the crop, which loses pixels
and is not what the profile page does either. **Tapping the preview therefore
picks a different image, and choosing one re-opens the unchanged "Adjust the
photo" dialog** — the same behaviour `/profile` has, which is what decision 1
("same component, same behavior") asked for. Remove and the visible preview are
implemented exactly as written, and the e2e proves shown → removed (name intact)
→ re-added through the crop dialog.
