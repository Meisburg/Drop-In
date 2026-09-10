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

- [x] New `src/lib/ics.ts`: pure `buildIcs(post, nowIso?): string` — VCALENDAR (VERSION + PRODID) + VEVENT with UTC DTSTART/DTEND from starts_at/ends_at (YYYYMMDDTHHMMSSZ), DTSTAMP from the nowIso seam (deterministic when pinned), UID derived from the post id, SUMMARY=title, LOCATION=place ("place, address" when an address is present — the ticket 08 fold-in), DESCRIPTION=age_hint ("Best for …" app copy) + details; RFC 5545 backslash/semicolon/comma/newline escaping, CRLF line endings, 75-octet line folding — plus colocated `src/lib/ics.test.ts` (27 tests)
- [x] "Add to calendar" button beside Share in the detail header action row; triggers a Blob download `playdate-<id>.ics` (text/calendar, createObjectURL + anchor click + revoke)
- [x] Button visible in the signed-out (public) view too (public-surface fields only)
- [x] Generated ICS is structurally valid (unit tests: UTC date format, each escape char, CRLF-only output, VEVENT required fields, LOCATION fold-in both ways, determinism with a fixed nowIso, folding <= 75 octets)
- [x] 375px: the button fits the action row with no horizontal scroll (both rows' button groups are flex-wrap; verified live at a 375px viewport in the public view — scrollWidth <= clientWidth)
- [x] npm run build && npm run test && npm run test:e2e exit 0 (230/230 unit, 17/17 e2e)

## Comments