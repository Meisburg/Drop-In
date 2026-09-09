# 01: Quick UX batch — report rework, host view, time stepper + duration, duplicate

**What to build:** Everything the founder flagged as friction that doesn't touch the schema. Feed cards lose the flag icon entirely (report already lives on the detail page and UserPage). The host's own event detail page shows an explicit "This is your post" panel with the going count instead of a bare number. The /new form's two datetime-local pickers become a start-time stepper (30-minute increments) plus duration chips (1h/1.5h/2h/3h) — the end time is computed, never typed. Your own posts (detail page + /profile) gain a "Duplicate" action that prefills /new with everything except date/time, which always require re-entry.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Feed cards have no report flag; card layout stays clean at 375px
- [ ] Detail page still has the Report button; filing a report works end-to-end
- [ ] Host viewing own post sees "This is your post" + count, no ping button
- [ ] Non-host still sees the "We're going" toggle and count (no regression)
- [ ] /new: start time via steppers, duration via chips; end computed; invalid inputs show inline errors, nothing saved
- [ ] /new validation is a reworked pure validator with unit tests (duration math covered)
- [ ] Duplicate appears on own posts only (not others'), prefills /new, forces re-entry of date/time
- [ ] npm run build && npm run test exit 0