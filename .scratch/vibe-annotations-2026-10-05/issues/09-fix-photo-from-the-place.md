# 09: A moderator can fix a photo from the place page

**What to build:** From the place page — where the photo now shows — a moderator
opens the same editor and replaces the photo, and the page updates in place. A
non-moderator sees no control.

**Blocked by:** 06 (the place page must show a photo for the edit to be visible),
08 (the modal host, the mount pattern, and the e2e both come from there).

**Status:** ready-for-agent

**Source:** annotations 5 and 6 in `source-annotations.json`.

- [ ] A moderator sees the control beside the place's photo, and tapping it opens
      the same editor the card opens.
- [ ] Saving updates the photo on the page with no manual reload.
- [ ] The control meets the 44px minimum tap target, and its accessible name
      states what it does rather than relying on an icon.
- [ ] A non-moderator sees no control on the page.
- [ ] The e2e added by 08 is extended rather than duplicated, so one editor has
      one behavioural spec.
- [ ] `npm run verify` exits 0.
