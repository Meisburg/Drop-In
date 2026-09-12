# 01: Post — location first: pick a place, drop the neighbourhood

**What to build:** Her words: *"maybe you just put in the address and not a
neighborhood because people aren't going to know that"* and *"could you @ the
location so you don't have to enter in the address, but that would mean that
those locations would have to be somehow like tagged already and populated?"*

The second half already exists — `/new`'s place field autocompletes over the 239
seeded City-of-Seattle places and one tap fills place + address + neighbourhood
(ticket 07, live). What is wrong is that **it reads as a plain text field**, so
nobody discovers it, and the **neighbourhood is still a REQUIRED separate
field** — the one thing she says parents cannot answer. Fix both: the place
picker becomes the first, obvious decision on the page, and the neighbourhood
stops being a question.

**Blocked by:** none (first ticket in the V9 queue).

**Status:** ready-for-agent

- [ ] `/new`'s FIRST field is the place picker, labelled so the affordance is unmistakable ("Where? — pick a place"), with a visible **Browse places** affordance beside it; typing filters the 239 places as it does today; typing `@` at the start of the field is treated as an alias for the same picker (polish, not the mechanism)
  - **AMENDED (V9 ticket 03, review cycle 1 F2): this AC is UNCHANGED, and it is now asserted in the state the page OPENS in.** Ticket 03 makes `/new` open on a summary; the first cut put the summary's title line in an always-open input, which made the title the form's first input *and* its first tab stop — inverting this AC — and `e2e/post-location.e2e.ts` was re-pinned to that inverted shape, so this AC was briefly asserted nowhere. The fix is the standard "editable summary row": the title on the summary is a **read-back** (text, plus a tap that turns it into the input in place), so collapsed `/new` has exactly ONE input — the place picker — and this AC is pinned literally again (`expect(fieldOrder[0]).toBe(PLACE_PLACEHOLDER)` and `expect(fieldOrder).toEqual([PLACE_PLACEHOLDER])`: first *and only*). The title is still editable on the summary, one tap away, and the same spec asserts that (`toContain(TITLE_PLACEHOLDER)` with the line open). Second guard: `e2e/post-fast.e2e.ts`'s interaction-count test — the whole posting flow touches exactly four controls, and the first is the place field.
- [ ] Picking a place fills place + address (+ the place's neighbourhood when it has one) in ONE tap — the existing behaviour, unchanged
- [ ] **The neighbourhood select is REMOVED from `/new`** (not optional — gone). A post is postable with a place (picked or typed) and nothing else; "Somewhere else" keeps working for places not in the directory
- [ ] **Migration 0035:** `playdates.neighborhood_id` drops NOT NULL (and the FK stays `on delete restrict`); no other column changes. Existing rows keep their values; a new post may carry NULL
  - **AMENDED (review cycle 1, F7): 0035 also drops NOT NULL on `playdate_series.neighborhood_id`. That is a NECESSARY extension of "no other column changes", not drift.** The series row is built from the same /new values as the post (`seriesInsertRow`), and `/new` awaits `createPlaydateSeries` BEFORE `createPlaydate` — so with the neighbourhood no longer asked, "Repeat weekly" would die on its own 23502, one table away from the field the parent cannot see. The migration header documents it as "the same question, one table over"; the reviewer confirmed the necessity independently; its FK is untouched too (`playdate_series_neighborhood_id_fkey`, ON DELETE RESTRICT).
- [ ] The card's meta line and the detail page render `place · window` and never an empty neighbourhood label: `neighborhood.name` renders only when present, and `get_public_playdate`'s `neighborhood_name` may now be NULL — the signed-out view must tolerate it (re-create the function with the same field list and scoping; a NULL label is not an error)
- [ ] The address is promoted from optional to the *normal* case when a place is picked (it arrives with the place), and the Maps link on the detail page keeps working exactly as today
- [ ] Pure seams + unit tests: a post built from a picked place sets place/address/neighborhood_id together, and one built from free text leaves neighborhood_id null without failing validation (`validatePlaydateForm` loses its neighbourhood rule)
- [ ] The seeded-place path and the free-text path both keep the "Recent places" chips (ticket 01 of V8) working
- [ ] New e2e `post-location.e2e.ts`: post with a picked place and NO neighbourhood → lands on the feed → its card shows the place and the address link works → the same for a free-text "somewhere else" post; **red-by-design pre-0035** (the insert 400s on the NOT NULL column), never a crash
- [ ] `npm run build && npm run test && npm run test:e2e` exit 0

**Migration check:** **REQUIRED — `supabase/migrations/0035_playdates_neighborhood_optional.sql`**
(number reserved; next free wins if the queue reorders).

- *Idempotency:* `alter table ... alter column ... drop not null` is naturally
  re-runnable; the RPC re-create is DROP + CREATE guarded (the 0021 pattern —
  and note 0021/0022's composite-type guard has a known wrong join,
  `t.oid = a.attrelid` should be `t.typrelid = a.attrelid`; **use the corrected
  join**, recorded in task-state).
- *Header must document:* that the neighbourhood stops being a question, that
  the nullable column is deliberate, that no RLS policy changed, and that
  existing rows are untouched.
- *Apply path (coordinator only):* `node scripts/apply-migration.mjs supabase/migrations/0035_*.sql`.
- *Post-apply probes:* (1) `information_schema` showing `is_nullable = YES` for
  the column; (2) a PostgREST insert of a row with a NULL neighbourhood through
  the app path (the new spec is that probe); (3) the 13-field
  `get_public_playdate` payload returning `neighborhood_name: null` for such a
  post without erroring; (4) an existing post still returns its label.
- *Human-owned:* none.

**Verify:** `npm run build && npm run test`; `npx playwright test
e2e/post-location.e2e.ts` (red pre-apply, green after); full suite; live marker
pass on a phone — pick Green Lake, see the address arrive, post without ever
answering a neighbourhood question.

## Comments
