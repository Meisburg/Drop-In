# 06: Quick feedback batch — card check, "Near you", status trim, ping copy

**What to build:** The origin-user's quick asks (feedback/v3.md, 2026-09-09; green light "go 1"). Six small changes: (1) #2 — a "going" check on the card's right edge: a 32px circular toggle (top-right of the card) that writes/removes the going_ping exactly like the detail page; inactive = white bg + slate border + gray check; active = green-600 fill + white check; stops propagation (the card link still navigates); hidden on your own post (the host panel covers it) and in the signed-out public view (sign-up prompt stands in). (2) #3 — the page h1 "Today" → "Near you" (redundant with the first section header; the feed is radius-based — the day lives in the section headers). (3) #4 — remove the "Best for …" age-hint line from the detail page (the DB column + /new field stay; ticket 09 reworks /new). (4) #5 — drop "Rained out" from the host status control: On / Cancelled only; migration 0019 (re-CHECK `playdates_status_chk` to ('on','cancelled') + convert existing 'rained_out' rows to 'on', DO-block idempotent, header documents the decision); the type union narrows to 'on' | 'cancelled'; the muted chip renders only for "Cancelled"; the Open-Meteo "Rain likely" badge stays (an independent forecast, not a state). (5) #8 — remove the /new helper text ("We'll be at the park 3–5, come by if you like." + the "Open invitation…" line). (6) #11 — ping button copy: "We're going" → "Attend"; active state → "✓ Going" (green-600 filled). The card check (1) mirrors the same state.

**Blocked by:** None ("go 1" green light, 2026-09-09).

**Status:** ready-for-agent

- [ ] Card check toggle: 32px circle, top-right of the card; toggles going_pings via the existing ping write path; stopPropagation/preventDefault (card link unaffected); hidden on own posts + in the signed-out public view
- [ ] Detail ping button: "Attend" → active "✓ Going" (green); toggle semantics unchanged
- [ ] h1 "Today" → "Near you"; day section headers (Today/Tomorrow/weekday) unchanged; e2e heading pins updated to 'Near you' (grep the specs for the old 'Today' heading assertion)
- [ ] Detail page: "Best for …" line removed (DB column + /new field stay)
- [ ] Migration 0019: `playdates_status_chk` re-CHECKed to ('on','cancelled') + `UPDATE ... SET status = 'on' WHERE status = 'rained_out'`; DO-block idempotent; header documents the feedback decision (Rained-out removed; Open-Meteo badge independent); applied live (orchestrator, dashboard SQL API fallback) after code green
- [ ] `PlaydateStatus` type = 'on' | 'cancelled'; status control = On / Cancelled; "Cancelled" muted state stays; no "Rained out" UI anywhere; Open-Meteo badge unchanged
- [ ] /new helper text removed
- [ ] 375px: the card toggle fits without breaking the meta line or title
- [ ] e2e/host-status.e2e.ts adapts: RAINED OUT → CANCELLED (the spec stays green pre-0019-apply — 'cancelled' is allowed by the old CHECK too)
- [ ] npm run build && npm run test && npm run test:e2e exit 0

## Comments