# Ticket 01 — follow-up findings (found after the builder was dispatched)

These were found by the coordinator's own recon while the ticket-01 builder ran.
They are part of ticket 01's acceptance, not new tickets.

## T11 — a neighbourhood-less post must remain EDITABLE, and the neighborhood-id plumbing types it as non-null

Evidence (all read, not inferred):

- `src/lib/types.ts:89` — `Playdate.neighborhood_id: string` (non-nullable);
  `:157` likewise. After 0035 a post's value is NULL.
- `src/lib/feed.ts:630` (`toEditFormValues`) and `:742` (`toDuplicatePrefill`)
  seed `neighborhoodId: post.neighborhood_id`, so on a NULL-neighbourhood post
  the /edit form holds `null` inside a field typed `string`, and the
  `<select>` (`src/components/PlaydateFormFields.tsx:274`) gets `value={null}`.
- `src/lib/db.ts:934` (`updatePlaydateWithClient`) writes
  `neighborhood_id: input.neighborhoodId` verbatim. An empty string reaches
  PostgREST as `""` → `22P02 invalid input syntax for type uuid`. The address
  and details paths already solve this exact problem ("Empty → null, so
  clearing details or the address actually clears it"); the neighbourhood needs
  the same treatment, or SAVING an edit of a neighbourhood-less post 400s while
  the parent changed nothing about its location.
- `src/lib/feed.ts:1061` / `:1097` — `RecentPlace.neighborhoodId` is read from
  `neighborhood_id`, which can now be NULL (the "Recent places" chips on /new).
- `src/pages/PlacePage.tsx:277` — the "Start a drop-in here" prefill carries a
  neighborhood id.

Required: make "no neighbourhood" representable end to end; keep /edit's
select WORKING (choosing a real neighbourhood still writes a real uuid); add a
unit test for the empty/null → null mapping on the wire.

## T5/T12 — the series column (`playdate_series.neighborhood_id`)

`supabase/migrations/0028_playdate_series.sql:127` declares
`neighborhood_id uuid not null`, and the generator copies it into occurrence
posts (`0028:289` and `:307`). With the neighbourhood question gone from /new,
"Repeat weekly" on a neighbourhood-less post is a 23502 not-null violation.

This is why 0035 is expected to carry a SECOND `drop not null` — the same
question one table over — documented in the migration header as a deliberate
extension of the ticket's "no other column changes" line. If the builder
proved it unnecessary, that proof goes in the report instead.

## T13 — the feed query's `!inner` embeds

`neighborhood:neighborhoods!inner ( id, name )` appears at
`src/lib/feed.ts:435`, `src/lib/db.ts:671`, `src/lib/db.ts:1139`,
`src/lib/db.ts:1667`. PostgREST's `!inner` is an INNER JOIN, so a post with
`neighborhood_id = NULL` would vanish from the feed AND from the profile's
Upcoming/Past lists. Those four must become plain (LEFT JOIN) embeds.
`src/lib/db.ts:391` (memberships) must stay `!inner` — a membership always has
a neighbourhood and `db.ts:397` dereferences `.neighborhood.name`.
