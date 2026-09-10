# Spec: Guest list — progressive disclosure on going pings

Status: needs-triage (founder-approved design, pending founder read)
Feature slug: `guest-list`
Date: 2026-09-09
Source: origin-user (founder's wife) beta feedback — "it's nice to know who's
coming specifically; you never see that in a group chat."

## Problem

The group chat hides who's actually coming: an open invite might mean three
families or zero, and nobody can tell until they're standing at the park.
Playdate's V1 answer was count-only pings (0007 header: "the UI never lists
per-person attendees"). Counts protect lurkers but throw away the strongest
piece of information a hesitant parent has: whether someone they know is
going.

## Decision (founder-approved 2026-09-09)

Progressive disclosure — visibility scales with involvement:

1. **Host sees the named list** of who pinged their event (first names as
   displayed in profiles). The host needs it to welcome people ("look for
   the red stroller"). Zero pressure cost — it's their own event.
2. **Pinged attendees see names** of co-attendees ("You, Sarah, Mia + 2
   families"). They already committed; no lurker exposure.
3. **Everyone else sees counts only** — the zero-pressure surface for
   strangers and browsers stays exactly as shipped in V1 (0007 RLS
   unchanged in spirit).

No attendee photos on cards, no public guest lists, no DMs between
attendees (comments remain the only public channel).

## Data model

`going_pings` (0007) already stores `playdate_id` + `profile_id` — the
guest list is a join to `profiles`, not a new table.

## RLS changes (one migration, numbered after V2's 0011–0014 land)

- Host SELECT: `exists (select 1 from playdates p where p.id =
  going_pings.playdate_id and p.host_profile_id = auth.uid())` — pings on
  own events, with the profiles embed for names.
- Co-attendee SELECT: `exists (select 1 from going_pings mine where
  mine.playdate_id = going_pings.playdate_id and mine.profile_id =
  auth.uid())` — pinged attendees see co-pings on the same event.
- Existing broad SELECT policy (count path) must be narrowed or replaced:
  other authenticated users get counts via `count()` (head/count request)
  which works under RLS without row-level name exposure. The existing
  client `getGoingCount` must keep working — verify before/after.
- DO-block idempotency per the logged lesson; real-DB REST smoke probe for
  embed ambiguity (PGRST201 lesson) since pings↔profiles adds an embed.

## UI

- Detail page, below the ping section: guest list block. Host view:
  "Going: Sarah, Mia, 2 more." Attendee view: "You, Sarah, Mia + 2
  families." Non-attendee view: unchanged count line only.
- Card (DropInCard): unchanged — counts only. Names never surface in feeds.
- Empty state hidden when count = 0.

## Pure seams + tests (house style)

- `resolveGuestListVisibility(viewerIsHost, viewerHasPinged, count)` in
  `src/lib/feed.ts` — unit-tested Vitest, mirrors `filterFeed` seam style.
- Mock-client pattern (`togglePingWithClient` prior art) for the guest-list
  fetch; RLS narrowing proven in the live check: host reads names, co-
  attendee reads names, third viewer reads names-free rows (verify SELECT
  returns no profile columns).

## Sequencing

- Gate: lands after V2 (post-beta-gate OK) and before beta wave 2 (first
  non-group strangers). Wave 1 (the origin moms' group) can run on V2 —
  they already know each other.
- Out of scope: public guest lists, "host marked complete" flows, reputation
  (see `.scratch/v3/parking-lot.md` — verified history, not reviews).