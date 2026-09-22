# V17 — Places: the Airbnb-style redesign (opened 2026-09-21)

Source: **V16 t07 items 5, 6, 7** — the three redesign sub-items the founder
deferred by his own decision **Q5** ("ship the t07 defects now; the Airbnb-style
redesign goes to its own spec + batch"). Items 1–4 shipped in V16
(`.scratch/v16/ledger.md`, "V16 BATCH CLOSED"). The Airbnb screenshots
(images 2–3) are **Airbnb's app, not ours** — reference material, never a bug
report. That distinction is recorded in `.scratch/v16/spec.md:11-13` and holds
here.

**This document is a spec, not a plan.** It states what to build and what the
open decisions are. `plan.md` is written AFTER the founder's rulings, and only
then is a builder dispatched (AGENTS.md: "Written BEFORE any builder dispatch").

---

## 1. What the founder asked for (verbatim, `.scratch/v16/spec.md:417-421`)

| # | Item | Status |
|---|---|---|
| 5 | Search results open already zoomed to the user's area | buildable now |
| 6 | Map at top, list below | **mostly shipped already** — see §3 |
| 7 | Big photo per place card; heart to save at top-right of the photo; a floating **Map** button that scrolls back to the map | **has a data blocker** — see §4 |

---

## 2. What I verified in the code (not inferred)

Every claim below cites `file:line` on the current tree (`a649d29`).

| Claim | Evidence |
|---|---|
| **Places have no photos — not one.** The type carries `photo_url`, but its own doc says NULL for every seeded row. | `src/lib/types.ts:307-308` — *"NULL for every seeded row: third-party photos are never scraped."* `BrowsePage.tsx` renders no `<img>` at all. |
| **A "save a place" concept ALREADY EXISTS, with schema and RLS.** It is called a **follow**, not a heart. | `follows` table (migration 0033); `toggleFollowPlace` `src/lib/db.ts:3961`; `getPlaceFollowState` `:3893`; the control at `PlacePage.tsx:391-405` (`data-testid="follow-place"`). |
| **…and the bulk read the card grid would need ALREADY EXISTS.** No new query is required for a heart on 239 cards. | `listMyFollowsWithClient` `src/lib/db.ts:3723-3734` returns the caller's own follow rows in ONE request; `followTargetsFrom` (`src/lib/follows.ts:104`) already splits them into family/place id sets, and `FeedPage.tsx:488` calls it. |
| **The map is already at the TOP of `/browse`.** Item 6 is 90% built. | `BrowsePage.tsx:388-413` — the map card renders above the search/filter card (`:415`) and the list (`:520`). Shipped in V13 t05. |
| **The map's zoom is already a settled policy — item 5's sibling problem was fixed in V16.** The framing authority is the radius circle, not the points. | `PlaceMap.tsx` — the points-fit was DELETED (V16 t07 item 2, `93f313b`); `framingCircle` `src/lib/places.ts:733` decides geocode → home pin + radius → null. |
| **A place-follow count is readable only through a SECDEF RPC, and only for ONE place at a time.** A grid showing "N families follow this" per card would be N calls. | `countPlaceFollowers` `src/lib/db.ts:4014`; `PlacePage.tsx:89-96` documents why (the follows table is owner-only). |
| **The modal stacking bug is fixed, so a new floating button is not entering a broken layer.** | `MODAL_OVER_LEAFLET_Z_CLASS` `src/lib/stacking.ts`, used at `BrowsePage.tsx:598` + `:695`; V16 t07 item 1. |
| **`/browse`'s list defaults to A–Z and leads with 6 grouped rows + an overflow door.** | `BROWSE_LIST_LEAD_LIMIT` `src/lib/places.ts:544`; `leadGroups`/`overflowRows` `BrowsePage.tsx:526-564`. |
| **The playtest lane asserts `/browse` contains "Sign in" only** — it is a signed-out route check. | `.scratch/playtest/routes.json` — `{ "path": "/browse", "must_contain": ["Sign in"] }`. No redesign assertion there to break. |

**Net effect: two of the founder's three asks are cheaper than they look, and
the third is blocked on a decision only he can make.**

---

## 3. Item 6 — "map at top, list below": already true

The map IS above the list (`BrowsePage.tsx:388` vs `:520`). What is **not** there
is the Airbnb *feel*: on Airbnb, the map occupies a large fixed-height viewport
and the list scrolls beneath it as a card rail. Ours is a bordered card of
Leaflet's own default height.

So item 6 is not "move the map." It is **"give the map a deliberate height and
make the list read as content below it."** Two candidate shapes:

- **(6a) Map band + scrolling list** (closest to the founder's screenshots). The
  map becomes a fixed-height band (e.g. 45dvh) pinned at the top; the list
  scrolls under it in normal document flow. The floating Map button (§5,
  item 7c) scrolls back to the band.
- **(6b) Map/list toggle** — one surface at a time, a segmented control at the
  top. This is what **V16 t06 item 3** asked for on the FEED
  (`.scratch/v16/spec.md:273-293`), and t06 item 3 is still unbuilt.

**Open decision D2 (§7).** Recommendation: **6a on `/browse`, and defer 6b.**
Reason: the founder's reference screenshots show map-above-list, not a toggle,
and the feed's toggle (t06.3) is a separate unshipped item — building a toggle
on `/browse` would invent a pattern the feed has not adopted yet.

**Measurable rule (Q6 requires measurable acceptance):** on `/browse` at 390px
wide, the map container's rendered height is **≥ 240px and ≤ 60dvh**, and the
first list row's top edge is **below** the map container's bottom edge.

---

## 4. Item 7 — the photo blocker, and what is actually buildable

### 4.1 The blocker is real and unchanged

`Place.photo_url` is NULL for all 239 seeded rows (`types.ts:307-308`). The two
sources are the City of Seattle parks open data and a hand-curated indoor list;
neither carries imagery, and the repo already made a deliberate call not to
scrape third-party photos. So **"big photo per card" cannot be built as
described** without a decision. The three options (`v16/spec.md:433-445`):

- **(A) Drop the photo.** Card leads with what EXISTS: kind, distance, ages,
  indoor/outdoor, upcoming count.
- **(B) Generate imagery.** Illustrated per-`kind` header art. Cheap, consistent,
  but decoration rather than information.
- **(C) Real photos.** Licensed source + new column + backfill. A data
  acquisition project, not a UI slice.

**D1 — RULED 2026-09-21: real photos, sourced from Wikimedia Commons, with manual
curation for the gaps. It becomes its own ticket (t05) that the card work does
not block.** The founder's original instinct was Google; §4.1.1 records why that
specific source is not available and what replaces it. Cards ship WITHOUT photos
and gain them when t05 lands.

#### 4.1.1 Why not Google (asked and answered 2026-09-21)

The founder asked: *"Why couldn't we just source them from Google so that we have
a database of common places people meet up around Seattle?"* Two independent
reasons, and only one is technical:

1. **Google's terms forbid it.** The Places API does not permit caching or
   storing place photos — they may be displayed alongside Google data but not
   collected into a separate database — and the Maps terms bar using Google
   content to build a competing directory. Scraping image results is a clearer
   violation still.
2. **It conflicts with the product's own posture.** Playdate is privacy-first for
   children. A scraped directory of "where families gather" is precisely the
   artifact the product is designed not to be.

**The instinct was right; the source was the problem.**

#### 4.1.2 Wikimedia Commons — MEASURED, not assumed (2026-09-21)

Probed live against Commons' `generator=search` API using the **real 239 seeded
place names** from `supabase/migrations/0029_places.sql`, one query per name,
`gsrnamespace=6` (File:).

**Result: 24 of 30 sampled names returned at least one image = 80% hit rate.**

Licenses on the hits, all reusable with attribution: CC BY-SA 3.0 (9), Public
domain (6), CC BY 2.0 (3), CC BY 4.0 (2), CC BY 3.0 (1), CC BY-SA 4.0 (1), CC0
(1), No restrictions (1). **No non-free or unclear license appeared.**

**THE USABLE RATE IS LOWER THAN THE HIT RATE — this is the finding that matters.**
A name search returns images that merely *match the words*, not images *of the
place*. Spot-check of five top hits:

| Query | Top Commons hit | Usable? |
|---|---|---|
| Seward Park | *Aerial view of Seward Park, Seattle.jpg* | **yes** |
| Madison Park | *Madison Park, Seattle - April 2019 - 03.jpg* | **yes** |
| Warren G Magnuson | *Warren G. Magnuson elected to the House of Representatives.jpg* | **NO — a portrait of the congressman** |
| Alki Playground | *Senior Citizen Walking Club at Alki Playground, 1980* | **NO — wrong subject and era** |
| Ballard Community Center | *Ballard Recreation Center, 1970* | **marginal — historical, not current** |

**So ~80% coverage does NOT mean ~80% of cards get a good photo.** Auto-matching
is not sufficient; a human eye is required per image. Plan for it.

**Two operational constraints learned by hitting them:**
- The API **requires a `User-Agent`** — without one it answers **403**. An early
  version of this probe omitted it and silently reported a 0% hit rate, which was
  a measurement bug, not a fact about Commons. Recording it because the same
  mistake in a backfill script would look like "no photos exist."
- It **rate-limits hard (429)** at ~0.15s between requests. A backfill must pace
  itself (~1s+) and back off on 429, or it will report false negatives.

**A per-`kind` fallback exists for gaps.** 10 kinds are defined
(`PLACE_KINDS`, `src/lib/places.ts:73-84`): park, playground, indoor_play,
museum, pool, splash_pad, library, beach, trail, other. Any place without a
usable photo can fall back to the kind's illustration — which is option **(B)**,
reused as the floor rather than the whole strategy.

### 4.2 The heart — do NOT build a second save concept

This is the most important finding in this spec. The founder asked for "a heart
to save" per card. **That concept already exists, it is called following a place,
and it has schema, RLS, a SECDEF counter, and a `/settings` Following list.**

Building a separate `saved_places` table would create **two competing save
affordances over the same user intent** — a defect the repo already has a name
for (V15 t03: "a tab that showed the feed's own content"). The redesign must
**surface the existing follow as the heart**, not invent a parallel one.

**This makes item 7's heart nearly free:**

- **No migration.** `follows` (0033) already carries `place_id` with RLS.
- **No new read.** `listMyFollowsWithClient` (`db.ts:3723`) is one request for the
  whole grid; `followTargetsFrom` (`follows.ts:104`) already produces the place-id
  set.
- **No new write.** `toggleFollowPlace` (`db.ts:3961`) exists; `insertFollowRow`
  already treats a concurrent 23505 as success (`db.ts:3927-3933`).
- **One new lib seam**, per the build law (`docs/agents/code-structure.md`; a
  `lib/*.ts` without a sibling test is an incomplete slice): a pure
  `placeFollowIdSet(rows)` → `Set<placeId>`, so the grid knows which hearts are
  filled from ONE batched read. `followTargetsFrom` (`follows.ts:104`) is shaped
  around the FOLLOW ROW and splits family vs place ids, so this gives the grid a
  direct place-id set.

  > **CORRECTED 2026-09-21.** This was first written as a
  > `placeFollowPatch(placeIds, followIds) → Map<placeId, followId>` justified by
  > "the unfollow path needs the follow row id". **That was false** — see
  > `plan.md`'s corrected Interfaces. `toggleFollowPlace(placeId)`
  > (`db.ts:3961-3971`) resolves the row id itself. The t02 reviewer caught the
  > resulting dead value. The seam is a `Set` because a `Set` is all that is
  > consumed.

**One honest asymmetry to record:** the per-place follower COUNT
(`countPlaceFollowers`) is one RPC call per place. A heart on 239 cards must NOT
call it — the heart shows **only the caller's own state**, which is what the
owner-only RLS already permits in one batched read. No count on the cards. This
is a deliberate omission, not an oversight.

### 4.3 What item 7 decomposes into

| Sub-item | Buildable? | Notes |
|---|---|---|
| 7a. Card layout: bigger, image-forward or content-forward | yes | The card is currently `PlaceRow` (`BrowsePage.tsx:778-852`). Built photo-capable from day one, with the kind-illustration fallback (t04) until t05 fills in real photos. |
| 7b. Heart to save at top-right of the photo | **yes, near-free** — it is the existing follow (§4.2) | Needs the one new `lib/places.ts` seam. |
| 7c. Floating "Map" button that scrolls back to the map | yes, standalone | New UI; must not fight `MODAL_OVER_LEAFLET_Z_CLASS` (`stacking.ts`). |
| 7d. Real photos on the card | **own ticket (t05)** — Commons + manual curation | Does NOT block 7a: the card ships with the kind-illustration fallback and gains photos later. |

---

## 5. Item 5 — "search results open already zoomed to the user's area"

**This is largely already true, and the V16 fix is what made it true.**
`framingCircle` (`src/lib/places.ts:733`) gives the map a framing authority in
every common case — a geocode if one exists, else the home pin at the viewer's
radius — and V16 t07 item 2 (`93f313b`) deleted the competing points-fit that
was fighting it. The map opens on the viewer's area.

What remains is a **narrower question**: does the map frame the viewer's area
when the *search query* changes? Today the framing circle does not depend on the
query at all — narrowing to "splash pad" leaves the camera where it was, even if
every surviving place sits in one corner of the circle. Airbnb re-frames to the
results.

**Open decision D3 — RULED 2026-09-21: build it.** The founder chose to build the
query-aware framing rather than verify first. So item 5 is **t04**, real work.

**The constraint t04 must respect, and the reason this needs care:** a
query-aware reframe is one step away from the points-fit that V16 t07 item 2
(`93f313b`) deliberately **deleted**. The deleted code called
`fitBounds` over every marker; re-adding that to satisfy this item would revert a
settled ruling and bring back the blue-blob defect the founder originally
photographed. **t04 must extend `framingCircle` (`src/lib/places.ts:733`) — the
existing pure seam with its own tests — so the frame accounts for the searched
subset, rather than adding a new `fitBounds` call in the component.**

Two behaviours to pin when the plan is written:

- With no search query, framing is **unchanged** from today (geocode → home pin +
  radius). This is the regression guard.
- With a search query that returns places, the frame covers those places while
  still respecting the radius ceiling — never zooming out past the radius, which
  would undo the whole point of V16 t07 item 2.

Suggested acceptance rule: with a search query active, every place in the
filtered result set projects inside the map canvas; with no query, the framed
centre and zoom are byte-identical to the pre-t04 values.

---

## 6. Scope of V17 (tickets — D1/D2/D3 all ruled 2026-09-21)

| # | Ticket | Size | Blocked on |
|---|---|---|---|
| t01 | Map band + card layout on `/browse` (6a + 7a) | medium | nothing — D2 ruled |
| t02 | Heart = the existing follow (7b + the new lib seam) | small | nothing |
| t03 | Floating "Map" scroll-back button (7c) | small | nothing |
| t04 | Query-aware map framing (item 5) | small–medium | nothing — D3 ruled |
| t05 | **Real photos: Commons sourcing + curation + backfill (7d)** | **XL — its own batch** | nothing, but see below |

**Sequencing:** t02 and t03 have no dependencies and are the cheapest wins — ship
them first. t01 is the shape-setting slice. t04 follows t01 so the framing change
is measured against the new layout, not the old one.

**t05 does NOT block anything.** t01 builds the card photo-capable and falls back
to per-`kind` illustration art, so the redesign ships without waiting on photo
sourcing. t05 then fills in real photos behind the same slot. This is deliberate:
t05 is the largest and least predictable item in the batch (§4.1.2 shows why), and
gating the whole redesign on it would stall everything.

**t05's own decomposition (sketch — it gets its own plan when dispatched):**

1. Migration: `places.photo_url` already exists (`types.ts:307`), so the additive
   piece is a **photo attribution/license record** — source URL, license, and
   author per image. Idempotent, per `.opencodereview/rule.json`.
2. A **paced** backfill script (User-Agent required, 429 backoff — §4.1.2).
3. **Manual curation pass** over every candidate — the measured finding is that
   ~80% "hits" contain unusable matches, so this step is not optional.
4. Kind-illustration fallback for the places curation leaves empty.

**Non-goals (explicit):**

- No `saved_places` table, no second save concept (§4.2).
- No Google-sourced imagery, scraped or via Places API (§4.1.1).
- No per-card follower counts (§4.2).
- No re-introduction of a points-fit — see D3 in §7 and V16 t07 item 2.
- Not the feed's map/list toggle — that is V16 t06 item 3, still unshipped.
- No new route, so no `.scratch/playtest/routes.json` change is required
  (`/browse` is already listed). If a ticket adds one, the `ocr` rule at
  `.opencodereview/rule.json` requires the same-commit update.

---

## 7. Decisions — ALL THREE RULED 2026-09-21

| D | Question | **Ruling** | Consequence |
|---|---|---|---|
| **D1** | Where do card photos come from? | **Real photos from Wikimedia Commons, curated manually for gaps — its own ticket (t05).** Cards ship photo-capable with kind-illustration fallback first. Google ruled out on licensing (§4.1.1). | t01 is unblocked; t05 is a separate XL batch. |
| **D2** | Map shape on `/browse` | **(6a) big fixed-height map band, list scrolls beneath it.** The toggle stays out of scope (that is V16 t06.3). | t01 builds the band; t03's floating button scrolls back to it. |
| **D3** | Does item 5 need work, or did V16 t07 item 2 settle it? | **Build it** — query-aware framing is real work (t04). | t04 must frame to the SEARCH RESULTS. It must do so without reintroducing the deleted points-fit: use the pure `framingCircle` seam and extend it, never re-add a `fitBounds` over every marker. Reverting `93f313b` is the failure mode to avoid. |

**Nothing is gated any more — `plan.md` can be written for t01–t04 immediately.**
t05 gets its own plan when it is dispatched, because its shape depends on how
much curation the 239 rows actually need.

---

## 8. Risks

1. **The heart could quietly become a second save concept.** The whole risk of
   this batch. Mitigation: §4.2 is binding on the plan — the heart IS the
   follow, and a reviewer must reject a diff that adds a `saved_*` table.
2. **Card count vs. render cost.** `/browse` renders up to 239 rows. Adding an
   image-bearing card ×239 is a real phone cost. Mitigation: the lead is
   `BROWSE_LIST_LEAD_LIMIT = 6` and the rest sit behind the overflow door
   (`places.ts:544`, `BrowsePage.tsx:541-564`) — keep that structure.
3. **The floating Map button vs. the modal layer.** `stacking.ts` carries a
   documented layer table; a floating button that is not given an explicit
   layer can land under the map. Mitigation: cite the table in the slice, and
   keep the button BELOW `MODAL_OVER_LEAFLET_Z_CLASS`.
4. **Item 5's "fix" could be a regression.** A query-aware reframe is one step
   from the points-fit V16 t07 item 2 deleted. Mitigation: D3's constraint in
   §5 — extend `framingCircle`, never re-add a `fitBounds` over every marker,
   and pin "no query ⇒ identical framing" as an explicit acceptance rule.
5. **The photo backfill could ship wrong images silently.** Measured in §4.1.2:
   ~80% of name-search hits are real images, but several are the wrong subject
   (a congressman's portrait for "Warren G Magnuson"), the wrong era (a 1980
   photo for a kids' playground), or otherwise unusable. An automated backfill
   that trusts the top hit will put visibly wrong photos on cards. Mitigation:
   curation is a required step in t05, not a nice-to-have, and every photo
   carries its attribution record.
6. **A backfill script that reports false negatives.** Recorded because it
   already bit this spec: Commons answers **403** without a `User-Agent` and
   **429** under pacing. A naive script reads both as "no photo exists" and
   leaves places empty that have perfectly good images. Mitigation: §4.1.2's two
   constraints are requirements in t05, and the script must distinguish
   "no result" from "request failed."

---

## 9. Status log

- 2026-09-21 — spec opened. Verified against the tree at `a649d29`. Three
  findings change the shape of the batch: (i) item 6 is already 90% built;
  (ii) the "heart to save" already exists as the place *follow*, so item 7b is
  nearly free and needs no migration; (iii) item 5 may already be satisfied by
  V16 t07 item 2 and should be closed by screenshot rather than code. Awaiting
  D1/D2/D3.
- 2026-09-21 — **D1, D2, D3 all ruled.** D1: real photos from Wikimedia Commons,
  its own ticket (t05), cards ship without them. D2: fixed-height map band, list
  scrolls beneath. D3: build the query-aware framing (t04), extending
  `framingCircle` rather than reverting `93f313b`.
- 2026-09-21 — **Commons feasibility MEASURED** (§4.1.2), because D1's answer
  rests on a claim that was not previously evidenced. Probed the live API with
  the real 239 seeded place names: **80% of names return ≥1 image** (24/30), all
  on reusable licenses (CC BY / CC BY-SA / CC0 / public domain). **But the usable
  rate is lower than the hit rate** — of five top hits inspected, two were wholly
  wrong (a congressman's portrait, a 1980 seniors' outing) and one marginal. Two
  operational constraints found the hard way and recorded: the API returns 403
  without a `User-Agent` and 429 under fast pacing, either of which a naive
  script misreads as "no photo exists" — an early version of this probe did
  exactly that and reported 0%, a measurement bug rather than a fact. Tickets
  t01–t04 are unblocked; t05 is its own batch.
