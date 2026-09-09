# 01: Quick UX batch — report rework, host view, time stepper + duration, duplicate

**What to build:** Everything the founder flagged as friction that doesn't touch the schema. Feed cards lose the flag icon entirely (report already lives on the detail page and UserPage). The host's own event detail page shows an explicit "This is your post" panel with the going count instead of a bare number. The /new form's two datetime-local pickers become a start-time stepper (30-minute increments) plus duration chips (1h/1.5h/2h/3h) — the end time is computed, never typed. Your own posts (detail page + /profile) gain a "Duplicate" action that prefills /new with everything except date/time, which always require re-entry.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] Feed cards have no report flag; card layout stays clean at 375px
- [x] Detail page still has the Report button; filing a report works end-to-end
- [x] Host viewing own post sees "This is your post" + count, no ping button
- [x] Non-host still sees the "We're going" toggle and count (no regression)
- [x] /new: start time via steppers, duration via chips; end computed; invalid inputs show inline errors, nothing saved
- [x] /new validation is a reworked pure validator with unit tests (duration math covered)
- [x] Duplicate appears on own posts only (not others'), prefills /new, forces re-entry of date/time
- [x] npm run build && npm run test exit 0

## Comments

- 2026-09-09 — COMPLETE. Commit 8bdaeb2 (8 files: App.tsx routing for duplicate state, DropInCard flag removal, detail host panel, /new steppers+chips, ProfilePage duplicate list with queryMyPlaydatesWithClient). Verifier (orchestrator re-run): build exit 0, 77/77 tests (was 65 — 12 new tests covering 30-min grid, chips, end computation, prefill). All ACs traced in code by orchestrator. No migrations in this slice. Human live check pending (dev server :5173).