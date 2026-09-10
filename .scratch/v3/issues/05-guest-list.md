# 05: Guest list — progressive disclosure on going pings

**What to build:** Founder-approved design (`.scratch/guest-list/spec.md`,
2026-09-09; origin-user beta feedback: "it's nice to know who's coming
specifically; you never see that in a group chat"). Visibility scales with
involvement: the HOST sees the named list of who pinged their event
(names = `profiles.display_name` — the family's handle; kids' first names
stay in the kids table and never appear in the guest list — privacy pin
holds); PINGED attendees see co-attendee names ("You, Sarah, Mia + 2
families" — they already committed, no lurker exposure); everyone else
sees counts only — the V1 zero-pressure surface for strangers stays
exactly as shipped. No attendee photos, no public guest lists, no DMs.
Migration 0024: SECURITY DEFINER `get_guest_list(playdate_id)` following
the 0015 pattern (stable, search_path pinned, EXECUTE to authenticated
only, revoke public, DROP+CREATE idempotency) — returns names only when
the caller is the host or has pinged; the broad going_pings SELECT (count
path, `getGoingCount`) STAYS and is regression-verified before/after.
Residual vector (any authenticated user can read going_pings rows +
profiles and reconstruct names) is documented in the migration header —
accepted, same personalization-data class as blocks. Orchestrator trust
review before live apply.

**Blocked by:** The founder's read of this ticket (spec status: needs-triage —
founder-approved design, pending founder read) + the two-user beta green
light (plan-v2 slice 3.5).

**Status:** ready-for-agent (founder approved 2026-09-09)

- [ ] Migration 0024: `get_guest_list(uuid)` SECURITY DEFINER (stable, `set search_path = public, pg_temp`, EXECUTE to authenticated, `revoke ... from public`, DROP FUNCTION IF EXISTS + CREATE); returns pingers' display names ordered by ping created_at, only for host/pinger callers; header documents the broad-SELECT-stays decision + the residual vector; applied live via CDP after code green + orchestrator trust review
- [ ] Pure `resolveGuestListVisibility(viewerIsHost, viewerHasPinged, count)` in feed.ts, unit-tested (spec seam)
- [ ] `fetchGuestListWithClient(client, playdateId)` in db.ts (injected-client pattern)
- [ ] Detail page: guest-list block below the ping section — host view "Going: Sarah, Mia + 2 families" (max 3 names, then "+ N more"); attendee view "You, Sarah, Mia + 2 families"; non-attendee view the unchanged count line only
- [ ] Empty state hidden when count = 0
- [ ] Cards: the going line with up to 3 avatar circles per ticket 07 (avatars only); names still never surface in feeds (guest list = detail page only)
- [ ] `getGoingCount` regression verified before/after apply (count path unchanged)
- [ ] Live probes: host reads names; co-pinger reads names; a third viewer's RPC returns no names (count only via getGoingCount)
- [ ] One new e2e spec: host sees the guest list on a post with 2 pings
- [ ] npm run build && npm run test && npm run test:e2e exit 0

## Comments

- 2026-09-09 — Founder read: APPROVED ("approve and run 1 and 2"). Slice 5 remains gated on slices 1-4 (one-writer) + the two-user beta green light (plan-v2 3.5).
- 2026-09-09 — Renumbered: migration 0018 → 0024. Card AC amended per ticket 07 (origin-user feedback: avatars-only circles on cards; the names-stay-detail-only pin holds).