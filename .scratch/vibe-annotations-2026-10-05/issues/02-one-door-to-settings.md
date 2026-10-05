# 02: The profile page has one door to Settings

**What to build:** On a parent's profile, the Settings pills are gone from both
the read view and the edit form. The header's gear stays the single entry point,
and it is already on every signed-in screen.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Source:** annotation 7 in `source-annotations.json` — "remove we don't need here".

- [ ] Neither profile mode renders a Settings link.
- [ ] The header gear is still present on every signed-in route and still opens
      Settings.
- [ ] The existing sign-out spec, which pins the gear as the surviving control,
      still passes unchanged.
- [ ] Settings' own link back to the profile is left in place — the removal is
      one-directional, and this ticket does not touch the reverse door.
- [ ] `npm run verify` exits 0.
