# 03: Add-to-calendar (ICS) on the detail page

**What to build:** Parking lot #3 (priority 3). Parents live in calendars;
nothing on the detail page reminds them an event exists (push is V4-scale;
this isn't). "Add to calendar" on the detail page generates an ICS download
from title / place / starts_at / ends_at / age_hint / details — works on
any phone, today. Pure client-side generator, unit-testable like the other
lib seams. Uses only public-surface fields, so the button also appears in
the signed-out (public) view — read-only, no new data exposure.

**Blocked by:** None (dispatch gated on the two-user beta green light, plan-v2 slice 3.5).

**Status:** ready-for-agent

- [ ] New `src/lib/ics.ts`: pure `buildIcs(post): string` — VEVENT with UTC DTSTART/DTEND from starts_at/ends_at, SUMMARY=title, LOCATION=place, DESCRIPTION=age_hint+details; RFC 5545 comma/semicolon escaping; CRLF line endings — plus colocated `src/lib/ics.test.ts`
- [ ] "Add to calendar" button beside Share in the detail header action row; triggers a Blob download `playdate-<id>.ics`
- [ ] Button visible in the signed-out (public) view too (public-surface fields only)
- [ ] Generated ICS is structurally valid (unit tests: date format, escaping, CRLF)
- [ ] 375px: the button fits the action row with no horizontal scroll
- [ ] npm run build && npm run test && npm run test:e2e exit 0

## Comments