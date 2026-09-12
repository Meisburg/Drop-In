# 05: Post edit + delete — fix a plan instead of cancelling it

**What to build:** Plans change, and the app cannot accommodate it. There is no
edit and no delete for your own post anywhere: `PlaydateDetailPage.tsx` offers
the host only On/Cancelled and Duplicate (`:1187-1233`), and Duplicate drops the
date and time (`NewPlaydatePage.tsx:221-231`). So a typo in the start time
forces **cancel + repost**, which loses everyone who said they were going — and
silently, because nothing tells them. Add edit-in-place and delete, with the
notification half handled by ticket 03's inbox (and ticket 08's push).

**Blocked by:** Ticket 04 (one-writer).

**Status:** ready-for-agent

- [ ] New route `/playdate/:id/edit` (host-only; a non-host is redirected to the detail page, the `/mod` guard pattern) reusing **one** field set: extract the `/new` form body into a shared presentational component (`PlaydateFormFields`) so there is a single implementation of every field, chip and error (the `groupByDay` promotion precedent)
- [ ] Editable: title, place, address, neighborhood, details, start date + time, duration, "kids you're bringing" (replace-on-save via the existing `linkKidsToPlaydate`). The end time stays computed from start + duration — never typed
- [ ] Validation is the same pure `validatePlaydateForm`; a save that changes nothing is a no-op with no write
- [ ] Detail page host panel gains **Edit** (→ `/playdate/:id/edit`) and **Delete**; a post that has already started can still be edited (late plans are the normal case) but the time fields carry the existing "already started" reality — no new rule invented, the form just allows it
- [ ] Delete asks for confirmation with the honest consequence: it removes the drop-in **and** everyone's "I'm going" and comments. `going_pings`, `comments`, `playdate_kids` and `ping_kids` all cascade from `playdates` (`0007:10`, `0013:41`, `0022:45`, `0026:49`) so the cleanup is the database's job — do not hand-delete children client-side
- [ ] After delete: navigate to `/` and the post is gone from the feed; the old detail URL renders the existing "We couldn't find this drop-in" state
- [ ] Editing an occurrence that belongs to a series (ticket 06) edits **only that occurrence**; "edit the whole series" is explicitly out of scope for V8 and must be documented in the UI's absence (no dead control)
- [ ] New e2e `post-edit-delete.e2e.ts`: host changes the start time → the card and detail show the new window (viewer-side assertion, not just the DB) → host deletes → the feed no longer lists it and the detail URL shows the not-found state; cascade-safe REST cleanup
- [ ] `npm run build && npm run test && npm run test:e2e` exit 0

**Migration check:** **NONE — the policies already exist.** `playdates` ships
host-only UPDATE and DELETE policies from `0005` (capability without UI, per the
2026-09-04 decision), so both operations ride the existing whole-row posture.
**Do not add a SELECT-policy branch for this** — the 0014 lesson: a SELECT
policy's `USING` is evaluated against the UPDATE's new row, so touching the read
policy to "help" an edit is how the hide path broke before. One pin to respect:
updates use no `RETURNING` (the 42501 lesson) — plain `update`, then re-read.
Diff guard: nothing under `supabase/migrations/` changes.

**Verify:** `npm run build && npm run test`; `npx playwright test
e2e/post-edit-delete.e2e.ts e2e/host-status.e2e.ts`; live marker pass — edit a
time as host, confirm the viewer sees the new time, delete, confirm the detail
URL 404s. Sweep markers.

## Comments
