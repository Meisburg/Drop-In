# 02: Host status + weather badge ("it's on" / "rained out")

**What to build:** Parking lot #2 (priority 2 — differentiation; fits the
zero-pressure soul). Seattle outdoor drop-ins live or die by rain, and
parents currently have no way to know a 3 PM park meetup is still on.
Hosts get a status control (ON / RAINED OUT / CANCELLED) on their own post,
inside the "This is your post" panel — the only host-actions surface on the
detail page. Cards + detail render a muted "Rained out" / "Cancelled" state;
events STAY in the feed (the host can revert; no auto-expiry). Optional
"Rain likely" ☔ badge from Open-Meteo (free, no key, no user location):
daily `precipitation_probability_max` for the post's host `home_zip` (V2
pin: post location = host's home_zip; lat/lng from the 0012 zip_codes seed),
>= 50% (orchestrator pin) shows the badge. The app never senses location.
Migration 0016.

**Blocked by:** None (dispatch gated on the two-user beta green light, plan-v2 slice 3.5).

**Status:** ready-for-agent

- [ ] Migration 0016: `playdates.status` text NOT NULL DEFAULT 'on' CHECK (status IN ('on','rained_out','cancelled')); DO-block idempotency; header documents the anon-surface pin (0015's 11 public fields unchanged — status is authenticated-only); applied live via CDP after code green
- [ ] Host-only status control in the "This is your post" panel (detail page); `setPlaydateStatus` in db.ts (host-only — RLS `playdates_update_host` is the wall; a non-host API write is a silent 0-row 2xx per the 0014 lesson, and the client hides the control from non-hosts)
- [ ] Card + detail render muted "Rained out" / "Cancelled" states (styled, not hidden; the event stays in the feed)
- [ ] "Rain likely" ☔ badge on the detail page + Today-section cards when Open-Meteo daily precipitation probability for the host's home_zip on the event date is >= 50; fetch wrapper in db.ts (lat/lng from the client-side zip map); one fetch per distinct (zip, event-date), in-flight dedupe + module cache; retry on failure, NO caching of rejections; silently absent on error — no error state
- [ ] Pure `rainBadgeLabel(probability: number | null): string | null` in feed.ts, unit-tested
- [ ] Anon public surface (0015 `get_public_playdate`, 11 fields) unchanged
- [ ] One new e2e spec: host sets status -> muted state round-trips on card + detail
- [ ] npm run build && npm run test && npm run test:e2e exit 0

## Comments