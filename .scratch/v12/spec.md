# V12 spec — the 2026-09-17 founder batch: autosave settings, a faster time pick, ending events early, a richer self-view, a map

Date: 2026-09-17 · Origin: the founder's post-V11.5 feedback session (V11 +
V11.5 are shipped, pushed, and live-verified; the V11 follow-ups list is
fully closed — task-state V11.5 section). This batch takes the next round of
the founder's walkthrough: (a) /settings still makes you fill a form and
press Save behind an unsaved-changes guard; (b) the /new time section forces
a duration tap the fast path doesn't need; (c) a host who ends an event
early can only cancel it — there is no honest "ended" state; (d) the owner's
own /profile self-view no longer shows the kids' photos (they left the
public bucket in V9 t11 and now surface only on /settings), and the
post-again clone has loose ends; and (e) places carry coordinates in the DB
but no map anywhere to look at them.

The batch splits into **5 tickets** (queue order 01→05). Three carry
explicit founder decisions recorded below; the others are direct asks.

## What ships (5 tickets)

1. **01 — settings autosave.** /settings stops being "fill the form, press
   Save, survive the guard": profile fields (name, home zip + radius, bio,
   interests) and kids (add / edit / remove) autosave as they change. The
   explicit Save button + the dirty/unsaved-guard state machine go away,
   replaced by a saving/saved indicator; the destructive remove keeps its
   confirm dialog. No migration.
2. **02 — the new time model on /new.** Picking a start slot now picks the
   duration too (auto-suggested from the "until next hour" logic the feed
   already ships); the standalone duration tap on the fast path collapses.
   The V9-t03 tap budget drops 4 controls → 3 (place field, picked time row,
   Post). No migration.
3. **03 — end an event early.** A new `ended` status — founder decision,
   option A (honest history): an early-ended event stays in history as
   "ended", it is not a cancellation. The host status panel gains the
   option, the feed drops `ended` posts immediately, and history keeps
   them. **One migration (0041, reserved).**
4. **04 — profile self-view + post-again.** Founder decision: the kids'
   photos re-surface — on the owner's /profile self-view ONLY, read from
   the private `kid-photos` bucket (0038); every other surface (/u/:handle
   visitor view, cards, feed) stays photo-free, the V9 t11 invariant. The
   post-again / Duplicate clone (last post → pre-filled /new) gets its
   loose ends closed. No migration.
5. **05 — a map (Leaflet + OSM tiles).** Founder decision: Leaflet +
   OpenStreetMap tiles, explicitly no browser geolocation. Places already
   carry lat/lng in the DB (0029, nullable) and zips do (0012, the seeded
   gazetteer); ticket 05 renders them on the place surfaces. No migration.

## Out of scope (recorded, not built)

- V11 follow-up polish (stale /profile→/settings copy pointers +
  comment-only/e2e-doc nits) — already shipped as the V11.5 batch
  2026-09-17 (`b092886` + `5d85caa`), pushed + live-verified; the V11
  follow-ups list is recorded fully closed (task-state V11.5 section). Not
  re-ticketed. Known residual: now-stale comments in
  `e2e/post-location.e2e.ts` (V11 t05 'follow-up, not expanded') —
  recorded, not ticketed.

## Migration check

**ONE for the batch — ticket 03's 0041** (widen `playdates.status`'s
`playdates_status_chk` from the 0019 2-value `('on','cancelled')` to
`('on','cancelled','ended')`; probe the 0005/0016 `playdates_update_host`
RLS write path and the 0032 `notify_playdate_cancelled` trigger — decide in
the migration whether an `ended` transition notifies, recorded in the
ticket). Last applied migration: 0040. Tickets 01, 02, 04, 05: no
`supabase/` change.

## Verify (batch gate)

`npm run build && npm run test` per ticket (plus each ticket's e2e spec
list); final gate = full suite + lint. 0041 applied via the coordinator's
CDP tooling + live probe (a host ends a post → row `ended`, feed excludes
it). Manual pass: (a) /settings edits persist with no Save control and no
unsaved guard; (b) the /new fast path is place, time row, Post; (c) a host
ends a playdate early — it leaves the feed and stays in "Past" labelled
"ended"; (d) the owner's /profile shows the kids' photos, a visitor's
/u/:handle does not; (e) the place surfaces render a map from stored
coordinates.