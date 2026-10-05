# 08: A moderator can fix a photo from the place card

**What to build:** From a place card in the directory, a moderator opens the
existing photo editor in a modal and replaces the photo by link or by upload; the
card updates without a reload. A non-moderator sees no such control.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Source:** annotation 5 in `source-annotations.json` — "I need a way to update them easily in the UI".

- [ ] A moderator-flagged profile sees an "Edit photo" control on a place card,
      and tapping it opens the editor that already ships.
- [ ] Saving updates the card in place, with no manual reload.
- [ ] The control is a sibling of the card's own link, never nested inside it, so
      tapping it never navigates to the place's page.
- [ ] The control meets the project's 44px minimum tap target.
- [ ] A non-moderator sees no control anywhere in the directory.
- [ ] The editor component and its pure module are reused unchanged.
- [ ] A new spec covers the moderator path end to end and the non-moderator
      absence; `npm run verify` exits 0.
