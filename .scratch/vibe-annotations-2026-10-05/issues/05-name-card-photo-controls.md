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
