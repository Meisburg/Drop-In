# 06: A place page shows the place

**What to build:** Opening a place shows its photo above the name, with its
credit line. A place with no photo — or one whose photo fails to load — shows the
same per-kind illustration the directory card already uses, so the page never
looks broken or empty.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Source:** annotation 6 in `source-annotations.json` — "a photo of the place above the heading".

- [ ] The place page renders the photo above the heading, with its provenance
      visible.
- [ ] A place with no photo shows the per-kind illustration, hidden from
      assistive technology, with no empty frame.
- [ ] A photo that fails to load falls back to the illustration, exactly as the
      directory card does.
- [ ] One shared predicate decides "show a photo" for both the card and the
      place page, and one credit formatter serves both — no second copy of
      either rule.
- [ ] The existing e2e pin asserting that a place page carries no photo credit is
      updated to assert one.
- [ ] An ADR records the V20 reversal and what changed to make it coherent (the
      moderator photo tool). The applied migration that recorded the removal is
      not edited.
- [ ] `npm run verify` exits 0.
