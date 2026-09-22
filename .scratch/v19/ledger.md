# V19 ledger — tight maps, feed map, two-parent profiles

Base: 285b712 (V18 shipped). Baseline gate re-verified: npm run verify exit 0 ·
1007/1007 unit (28 files) · lint 0 errors / 62 warnings.

Batch opened from the founder's verbal feedback (2026-09-21). Seven "what exists
today" facts verified against the tree and the live DB BEFORE ruling:
  map frames the radius circle; founder's stored radius_miles = 35 (widest);
  default radius is 5; the FEED HAS NO MAP (V16 t06.3 never built); posts carry
  place_id + free-text place and NO coordinates; "About the parents" is ONE bio
  field; no partner/link concept exists in any of the 22 public tables.
Founder rulings D1-D5 recorded in spec.md §3.

Slice t01: dispatched (base 285b712)
Slice t01: complete — THE FOUNDER'S MAIN ASK, delivered and MEASURED.
  The change is one constant + one call site, which is the point:
  MAP_FOCUS_RADIUS_MILES = 1 (lib/places.ts) now feeds framingCircle's
  `radiusMiles` at BrowsePage, instead of the PICKED radius. The list still runs
  filterPlacesByRadius on the picked radius, untouched.
  MEASURED BEFORE/AFTER on the built bundle, authenticated, at 390px, with the
  founder's real stored radius (35):
    BEFORE: tile zoom 11 (city-wide -- the blob the founder photographed)
    AFTER:  tile zoom 13 (neighbourhood; each level doubles scale, so 4x closer)
  MEASURED THAT THE TWO HALVES ARE NOW INDEPENDENT (the assertion that matters):
    radius 1 mi  -> map r=125px, list max 1 mi
    radius 35 mi -> map r=125px, list max 6 mi
    => the map does not move; the list widens. Plus the honest affordance:
    "224 places outside this mile view — widen the distance below to see more."
A REAL DEFECT WAS FOUND BY THIS SLICE'S OWN TEST, not by review. My first test
  asserted "a search can never widen the frame" and it FAILED, returning 0.5 mi.
  Trace: `focusCenter` returns the MIDPOINT of the matched points, so a search
  matching one place ~7 miles away centred the frame ON THAT PLACE; the extent
  around a single point is zero, so it floored to MIN_FOCUS_RADIUS_MILES (0.5).
  The result was a half-mile circle centred 7 MILES FROM HOME -- the home pin
  off the canvas entirely, which is precisely what D1 forbids. This was
  PRE-EXISTING V17 t04 behaviour that D1 turns into a defect (under the old
  policy the map was allowed to follow a search). FIXED with a far-match guard:
  matches beyond the focus radius keep the frame anchored instead of dragging it.
  NOTE ON THAT BUG'S SHAPE: it would have been invisible in normal use (you only
  see it by searching for somewhere far away) and it is exactly the "search
  breaks the anchor" failure D1 exists to prevent.
RED-GREEN, BOTH DIRECTIONS, twice:
  (a) re-merging the radii (MAP_FOCUS_RADIUS_MILES = 35) -> 6 tests FAIL;
  (b) removing the far-match guard -> 2 tests FAIL. Both restored -> 122 pass.
TWO EXISTING TESTS ENCODED THE SUPERSEDED POLICY AND WERE AMENDED, not deleted:
  * lib/places.test.ts "a single match never yields a zero-extent circle" used a
    point 8.33 mi from home; under D1 that match rightly keeps the home frame.
    Its real invariant (no zero-extent circle) is preserved with a NEARBY match.
  * e2e "an active search frames the map on the matching places (V17 t04)"
    asserted the frame TIGHTENS on a search. Under D1 the map already frames 1
    mile, so there is almost nothing left to tighten -- measured, the circle is
    r=125px before and after. Rewritten to assert the invariant that still
    matters and that a regression WOULD break: the searched frame is never
    WIDER than the neighbourhood view (a leaked 93f313b points-fit blows past it).
  * e2e MARKER_PLACE_NAME moved "Alki Playground - Whales Tail" (6.27 mi from the
    marker's home) -> "Ballard Corners Park" (0.44 mi). The spec was finding NO
    marker because the fixture was outside the neighbourhood the map now draws.
    The behaviour under test is unchanged; the fixture moved into the frame.
  Both spec changes are RULING-DRIVEN and were confirmed with the founder
  (search does not zoom the map; the map does not follow a far search).
Slice t01 gate: npm run verify exit 0 · 1015/1015 unit (28 files) · lint 0
  errors / 62 warnings · places.e2e.ts 14 passed + the new D1 spec 2 passed.

Slice t02: dispatched (base 82c549b)
Slice t02: complete — THE FEED MAP (D2). / now renders a map band above the day
  sections; the day sections themselves are untouched (the map is ADDITIVE).
  Reused PlacesMap (the plan's pinned requirement — the V15.2 map regressions
  were fixed in the shared component, so a parallel one would re-earn them).
  New pure seam `feedMapPins` (lib/places.ts, +8 unit tests): drops posts with
  no resolvable coordinate and COLLAPSES posts sharing an exact coordinate, so
  two sessions at one park are one dot rather than an unclickable pile.
  The frame reuses framingCircle with MAP_FOCUS_RADIUS_MILES, so both maps open
  on the same V19 t01 neighbourhood view.
  The posts' own coordinates were ALREADY on the feed (`place_coords`, stitched
  by listRadiusFeed), so the pins needed NO new read; only the home pin needed
  the zip gazetteer, loaded best-effort (a failure drops the home pin, never the
  map).
  E2E (new spec, 2 tests) seeds its OWN data because the map correctly renders
  NOTHING for a feed of free-text posts — a spec against ambient data would
  prove nothing. It creates a PLACED post and a FREE-TEXT post, asserts the band
  appears with a numeric "N places with drop-ins" label, asserts the free-text
  post is in the FEED (so its absence from the map is a decision, not a missing
  row), then DELETES the placed post and asserts pins drop:
    "[V19 feed map] pins with a placed post: 3; after deleting it: 0;
     label '1 place with drop-ins'"
  That delete-and-observe is the strongest available proof the pins belong to
  the drop-in rather than to the basemap or the home pin. Both posts are
  deleted in a finally block, so the live DB is left as found.
TWO SELF-INFLICTED SPEC BUGS, both caught by running it, both recorded:
  (1) `duration_minutes` is not a column — the schema stores `starts_at` +
      `ends_at` (V13 t03 writes the difference into that pair). PGRST204 named
      it exactly.
  (2) The pin count used `.leaflet-marker-icon`, which counts IMAGE/DOM markers.
      This map uses circleMarkers, which render as SVG <path>. The screenshot
      taken at the failure shows the pin PLAINLY PRESENT on the map with the
      1-mile circle and home pin — the product was right and the assertion was
      wrong. Switched to `path.leaflet-interactive`, the same convention the V13
      A6 marker spec already uses.
Slice t02 gate: npm run verify exit 0 · 1023/1023 unit (28 files) · lint 0
  errors / 62 warnings · places.e2e.ts 16 passed · mobile audit PASS 18/18.

Slice t03: dispatched (base 514fa27)
Slice t03: complete — migration 0047 (parent_cards + account_links), APPLIED
  LIVE and applied twice (idempotent, both 201).
  Schema decisions worth keeping: a CHILD TABLE for parent cards rather than
  parent2_* columns, because "up to two" is a count, a parent is a PERSON while
  profiles is an ACCOUNT, and unlinking must not delete anyone's words.
  `profiles.bio` KEEPS its job (account-level text, still on /u/:handle) and is
  explicitly NOT replaced — the migration header states this so a later reader
  does not assume one superseded the other.
  "Up to two" is enforced in the DB (CHECK position 1..2 + unique
  (profile_id, position)), not just the UI.
A REAL BUG WAS FOUND BY PROBING, NOT BY READING THE SQL — the batch's most
  important finding, and the reason the probe exists at all.
  My first draft enforced "one partner per parent" with TWO partial unique
  indexes, one on requester_id and one on addressee_id, both where
  status='accepted'. A live probe with three real accounts showed the hole
  immediately: account A accepted a link as REQUESTER with B and, separately,
  accepted one as ADDRESSEE from C. Both were accepted. A ended up with TWO
  partners — which on a "up to two parents" profile renders THREE parents.
  Each index guarded one COLUMN; nothing guarded the PERSON who appears in both.
  FIX: a BEFORE INSERT OR UPDATE trigger that counts accepted links involving
  EITHER of the row's two people. A partial unique index genuinely cannot
  express this ("the other party" depends on which column you are in), so the
  rule moved to where it can see the whole row. The trigger fires on UPDATE too
  — the probe's exact sequence was pending→accepted, which an INSERT-only
  trigger would have missed.
  CONVERGENCE: the bad indexes are dropped and the surplus accepted rows are
  DEMOTED to 'declined' rather than deleted — the invitation really happened,
  and erasing it would rewrite history to make the schema look like it never
  had the bug. The oldest accepted link per person survives.
  RE-PROBED AFTER THE FIX: every person has <=1 accepted link (was 2), and a
  second accepted link is refused with HTTP 409 "a parent may have only one
  linked partner". PROVEN, not assumed.
PRIVACY PROBED LIVE with three real accounts + real JWTs (not read off the SQL):
  * third party C reads account_links: 0 ROWS. parties A and B: 1 row each.
  * anon reads account_links: 0 rows.
  * C tries to alter A&B's link: 0 rows touched, status still 'accepted'.
  * C tries to create a parent_card FOR A: HTTP 403 / 42501 (RLS refusal).
  * anon reads parent_cards: 0 rows (not public).
  * position 3 on parent_cards: HTTP 400 / 23514 (the "up to two" CHECK).
  * self-link: HTTP 400 / 23514. duplicate pending invite: HTTP 409.
  All probe rows and probe auth users deleted afterwards; parent_cards and
  account_links verified back to 0 rows.
  Evidence: evidence/t03-apply.log, t03-apply2.log, t03-rls-probe.log.
Slice t03 gate: npm run verify exit 0 · 1023/1023 unit · lint 0 errors / 62.

Slice t04 (part 1): the pure seams + DB writers.
  NEW `src/lib/links.ts` + `links.test.ts` (18 tests): normalizeHandle,
  validateLinkRequest, linkStatusLabel, and `linkView` — a discriminated union
  of the five states a parent can be in (none / outgoing / incoming / declined /
  linked). Each REJECTION gets its OWN message, which is the reason the module
  exists: "no parent has that handle" and "that is your own handle" need
  different fixes from the user, so they must not collapse into one generic
  failure. `declined` is its own state rather than folded into `none` — the
  sender is owed the news, and silently showing the empty form again would leave
  them wondering whether the invite ever sent.
  NEW db.ts seams: listMyAccountLinks(+WithClient), findProfileIdByHandle
  (ilike = case-insensitive, matching normalizeHandle), requestAccountLink
  (throws LinkTargetUnknownError so the UI can show the spelling message;
  treats 23505 as SUCCESS because the invitation the parent wanted already
  exists), respondToAccountLink, unlinkAccounts, getProfileSummaryById, and the
  parent-card writers (listParentCards, saveParentCard upserting on
  (profile_id, position) so one statement covers first write and every edit,
  setParentCardPhoto, deleteParentCard).
  Writers deliberately do NOT use .select().single() — the 42501 discipline.
  Gate: npm run verify exit 0 · 1041/1041 unit (29 files) · lint 0 errors / 62.

Slice t04 (part 2) + t05: THE PROFILE UI — parent cards and the link section.
  `/profile` gains "The parents" (up to two cards, each name + about + save +
  remove) and "Linked parent" (the five linkView states rendered).
  `ParentCardEditor` serves BOTH the filled card and the empty slot, so the
  parent sees where the second card goes before filling it. It uses an explicit
  SAVE rather than autosave (unlike the bio): a card can be created and deleted,
  and a half-typed new card autosaving would insert a row nobody finished.
  New pure seam `parentCards.ts` + tests (10): parentCardList sorts by SLOT and
  caps at two (belt-and-braces beside the 0047 constraint — a profile rendering
  three parents on a two-parent layout is the failure it prevents), and
  nextParentPosition returns NULL at the cap so the page HIDES the add control
  rather than offering a button whose write the database would refuse.
  DRIVEN END-TO-END THROUGH THE REAL UI (not just unit-tested):
    add parent 1 -> slot 2 appears; add parent 2 -> "Two parents is the limit";
    DB read-back shows both rows at position 1 and 2 with their text.
  DISTINCT MESSAGES PROVEN, which is the point of links.ts:
    self-link    -> "That is your own handle."
    unknown      -> "No parent has the handle \"...\"."
    The two differ (asserted). A single generic failure would have hidden the
    difference between "you typed yourself" and "there is no such parent".
  Test cards deleted afterwards; parent_cards verified back to 0 rows.
  Note on lint: +2 warnings (62 -> 64), both `react(set-state-in-effect)` on the
  two new load effects — the SAME pattern the file's two existing loads use at
  lines 169/179. House pattern, not a defect; recorded rather than hidden.

Slice t06 (lanes):
  FULL E2E SUITE: 102 passed, exit 0 — the whole suite, including both new V19
    specs (the D1 map spec and the feed-map spec). evidence/t06-e2e-full.log.
  playtest lane PASS — 8 routes, 0 uncaught JS errors, exit 0.
    evidence/t06-playtest.log. Both lane processes released.
  mobile audit PASS 18/18 (6 viewports x 3 routes), exit 0.
    evidence/t06-mobile.log.
  ocr third lane: running (results in evidence/t06-ocr.log + ocr-v19.json).

ocr ADJUDICATION — 17 findings, 16 fixed, 1 kept as documentation.
  * HIGH (fixed) — A REAL BUG THAT WOULD HAVE BROKEN POSTING. FeedPage
    synthesised `id: 'feed-pin-N'` Place rows for the map, so tapping a feed pin
    offered "Start a drop-in", which hands /new that id as `placeId`. VERIFIED
    against the live catalog: `playdates.place_id` is uuid with an FK to
    places(id) — the insert would have failed with a raw Postgres error behind a
    button that looked fine. "Details" was equally broken (/place/feed-pin-0).
    FIX, two-sided: `feedMapPins` now returns a `FeedMapPin` carrying the post's
    REAL place_id (null for free text), and `PlacesMap` gained `placeActions`
    (default true) so a map holding a non-directory pin drops the controls it
    cannot honour while keeping the informational panel. The e2e spec now
    asserts `Details` never contains 'feed-pin-'.
  * MEDIUM (fixed) — RACE in my own migration trigger. A bare `select count(*)`
    is insufficient under READ COMMITTED: two concurrent accepts sharing a
    person lock DIFFERENT rows, neither sees the other, both commit, and the
    parent ends up with two partners — the exact invariant the trigger exists to
    hold. FIXED with `pg_advisory_xact_lock` on both people's keys (ordered
    least→greatest to avoid deadlock), so same-person accepts serialise and
    different-person accepts do not block.
  * MEDIUM (fixed) — the link section could never show WHO it was linked to:
    nothing populated `otherHandle`, so every `@…` branch was unreachable and
    every state fell back to "your partner"/"them". A parent could link an
    account and never see whose. FIXED with `listMyAccountLinksWithHandles` (one
    BATCHED counterparty read, never one per row), wired into ProfilePage.
  * MEDIUM (fixed) — the feed band said "N places with drop-ins" while the map
    frames only 1 mile, so the two numbers could visibly contradict each other.
    FIXED with the same honest affordance /browse has: "N places are outside
    this mile view".
  * MEDIUM (fixed) — `feedMapPins` took a `zipCoords` parameter no caller could
    exercise (placeCoordsFor returns {lat,lng} with no address, so the gazetteer
    fallback never fires). Removed, with the reason recorded; the signature
    change surfaced every caller that passed it.
  * LOW (fixed) — `.ilike()` wildcard injection: `_`/`%` in a handle matched
    OTHER parents, and since display_name is case-SENSITIVE-unique, 'nicole' and
    'Nicole' could coexist and maybeSingle() would throw a raw multi-row error
    instead of the promised typed one. PROVED on the live DB: unescaped 'j_n'
    matches BOTH 'jon' and 'jan'; escaped matches neither. Now escaped.
  * LOW (fixed) — removed the dead `partnerByProfileId` export (its doc
    described a return shape it did not have) and gave
    `getProfileSummaryByIdWithClient` the client parameter every other seam in
    the section takes.
  * LOW (fixed) — migration doc corrections: the header's "strictly additive"
    claim was overstated (the first-draft cleanup DOES mutate rows — corrected
    to say so honestly), the redundant delete policy is now labelled as
    redundant rather than justified by a wrong claim, and both duplicated bound
    sets (position 1..2 ↔ MAX_PARENT_CARDS; status ↔ AccountLinkStatus) now name
    their TS counterpart.
  * LOW (fixed) — `ocr` noted the RLS claims had NO in-repo regression guard.
    Added `e2e/account-links.e2e.ts` (2 tests) against the REAL database with
    REAL JWTs: a third account reads ZERO link rows, cannot alter one, anon
    reads zero, C cannot forge a card for A, and a THIRD card is refused.
    Self-cleaning. 2 passed.
  All fixes re-verified: npm run verify exit 0 · 1053/1053 unit (30 files) ·
  lint 0 errors / 64 warnings · places e2e (feed map) 2 passed · account-links
  e2e 2 passed · clean-range PASS.

SPEC BUG, caught by the FULL suite after passing in isolation (recorded because
  it is the failure mode "it passed when I ran it" hides):
  e2e/account-links.e2e.ts stamped a unique value into the email but used a
  FIXED display_name (`e2e-rls-a`), which is UNIQUE in profiles
  (profiles_display_name_key). It passed alone and failed in the full run on a
  leftover row from an earlier attempt: HTTP 409 / 23505 on the handle. That is
  a bug in MY spec, not the product. Fixed by stamping the handle too, and
  PROVEN by `--repeat-each=2` (3 passed), which is exactly the condition that
  exposed it. Leftover e2e rows swept afterwards; the founder's 2 profiles and
  10 playdates verified intact with the moderator flag held.
