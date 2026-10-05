# 01: The post form has one time control

**What to build:** A parent posting a drop-in sets the time in one place. The
quick-start preset row is gone from the post form; editing an existing drop-in is
unchanged, since it never had the row.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Source:** annotation 3 in `source-annotations.json` — the `/new` time-presets row.

- [ ] The post form renders no preset row; the time field is the only way to set a
      start time.
- [ ] The form's existing time defaults are unchanged — a fresh form still opens
      at the parent's own clock.
- [ ] Editing an existing drop-in is untouched and still renders no preset row.
- [ ] The preset builder and its unit-test block are deleted, and the
      `time-presets` e2e spec is deleted with the feature.
- [ ] The v29-5 acceptance criterion that pinned the presets is **superseded, not
      silently dropped**: the V29 plan is archived byte-identically at
      `plan-v29-backup.md`, and the live plan carries a decision note dated
      2026-10-05 stating that the time field is the only time control. An
      archived plan is a record and is not edited.
- [ ] `npm run verify` exits 0.
