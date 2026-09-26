# V25 ticket 16 — Place photos

**Type:** research memo. No product code, no migration, no schema change, no DB
write. Nothing outside `research/` was modified by this ticket.

Worktree: `/home/jmeisburg/Projects/playdate-app.worktrees/v25` @ `dcd008e`
Branch `v25`.

Reading order for the founder: **§7 is the answer.** §5 and §6 are the parts
that have not been measured before.

---

## 1. The question

Can a place carry a photo, given this app's privacy posture and its data
sources — and if so, how, at 239 seeded Seattle places, without per-image human
curation?

The founder's annotation, verbatim (`.scratch/v25/annotations-export.json`,
annotation index 20, created `2026-09-26T14:21:19.079Z`, page
`https://drop-in-mu.vercel.app/browse`; the ticket quotes it at
`.scratch/v25/issues/16-place-photos-research.md:12-20`):

> "I do think it makes sense for places to have photos being pulled that
> represent what they are. I just can't manually manage that myself at scales. I
> don't know what a good solution is. But I do think we should be trying to show
> photos of the places because otherwise it just looks they don't look very
> interesting or compelling. You know what I mean? It would be cool if users
> could report a photo if it's inaccurate or upload a photo that looks better if
> they wanted to share their own photos. I don't know. But I think ultimately we
> should try to be pulling the most popular photo that represents each place
> from Google or whatever or the official website."

Two things to note about the quote itself. The ticket's transcription at
`:18-19` reads "from Google or whatever the official website"; the export reads
"from Google or **whatever or** the official website." The export also includes
a sentence the ticket dropped: *"You know what I mean?"* Neither changes the
question.

**A note on the ticket's own line citations.** The ticket cites
`PlaceDirectory.tsx:919-1078` for the place card and `PlacePage.tsx:345-439`
for the removed photo. In this worktree the card component `DirectoryRow` is
`src/components/PlaceDirectory.tsx:1191-1352` and the removed-photo comment is
`src/pages/PlacePage.tsx:379-405`. The ticket's numbers look like the
parent/pre-V25 state; the *substance* of every code claim it makes is correct,
and this memo uses verified line numbers throughout.

---

## 2. What the code already does today

### 2.1 A place, and the photo fields it carries

`Place` is defined at `src/lib/types.ts:296-352`. The photo fields are real and
fully documented:

| Field | Line | Meaning |
|---|---|---|
| `photo_url` | `src/lib/types.ts:313` | The image. Doc comment says it is **"hotlinked from Wikimedia's CDN"** (`:311`). |
| `photo_source_url` | `src/lib/types.ts:319` | The Commons **FILE PAGE** — canonical provenance. |
| `photo_license` | `src/lib/types.ts:321` | Licence as Commons states it, e.g. `"CC BY-SA 3.0"`. |
| `photo_author` | `src/lib/types.ts:327` | Author as **plain text** (Commons' `extmetadata.Artist` returns HTML; the backfill strips it). |
| `photo_attribution` | `src/lib/types.ts:333` | The ready-to-render credit line. |

`places.photo_url` is also documented as **public infrastructure**: "`places` is
anon-readable (the signed-out detail page links to a place page) and has NO write
policy at all — the client never writes a place, the seed is the only writer"
(`src/lib/types.ts:283-285`). That is confirmed in the schema: the only policy on
`places` is `places_select_public`, granted `to anon, authenticated`
(`supabase/migrations/0029_places.sql:407-410`, guarded by the `pg_policies`
check at `:401-406`), and there is no INSERT/UPDATE/DELETE policy anywhere on the
table (`supabase/migrations/0029_places.sql:396-397`).

The attribution columns were added by
`supabase/migrations/0046_place_photo_attribution.sql:65-103` — four nullable
text columns, no constraint, no policy change (`:41-44`).

### 2.2 The credit seam exists and is DEAD CODE

`photoCreditLine` — the licence-compliance render rule — is
`src/lib/places.ts:1048-1053`, documented at `:1021-1047`. It handles the
three-valued cases correctly: no photo ⇒ null, photo with no attribution ⇒ null
(not `''`), whitespace-only ⇒ null (`src/lib/places.ts:1049-1052`).

**It has zero production callers.** A repo-wide grep for `photoCreditLine` finds
only its own definition (`src/lib/places.ts:1048`), its import and tests
(`src/lib/places.test.ts:39`, `:1614-1665`), and prose *about* it at
`src/pages/PlacePage.tsx:63` and `:382`. No `.tsx` file calls it.

### 2.3 Nothing renders a photo — verified at every place surface

- **The card** `DirectoryRow` (`src/components/PlaceDirectory.tsx:1191-1352`)
  renders a `<Link>` with a text block only: name (`:1255-1261`), an optional
  Follow button (`:1262-1295`), then kind/indoor, distance, address, the
  "Learn more" anchor (`:1330-1339`) and notes (`:1343-1348`). Its entire body is
  `flex flex-col gap-1 p-3` with no image element.
- **`<img` count is 0** in all three place surfaces:
  `src/components/PlaceDirectory.tsx`, `src/pages/PlacePage.tsx`,
  `src/pages/PlaceDetailsPage.tsx`.
- **`src/pages/PlacePage.tsx:379-405`** is the V20 t01 tombstone comment. It
  records that the photo was removed from the page, that the machinery
  (migration `0046`, `buildAttribution`, `photoCreditLine`, the backfill script)
  is untouched, and (added by V25 t04 at `:393-405`) that **a photo's return is
  currently UNOWNED, not deferred to this ticket** — ticket 16 is research-only,
  so nothing downstream restores one.
- **Both specs assert the absence**: `e2e/places.e2e.ts:1748` asserts
  `place-photo-credit` has count 0 and `:1750` asserts `figure img` has count 0.
- **The fallback vocabulary has one consumer.** `PLACE_KIND_ICONS` is
  `src/components/icons.ts:81`, tested at `src/components/icons.test.ts:28`, and
  its single live use is the category-chip glyph
  `src/components/PlaceDirectory.tsx:698`. It is documented at
  `src/components/PlaceDirectory.tsx:277-278` and `:627-628` as "the glyph map …
  built for the card photo slot; this row is its first live consumer." The
  comment at `src/components/icons.ts:63` records that it "falls back to while
  `places.photo_url` is NULL for every seeded row" — **that comment is now
  stale; see §2.5.**
- The feed map and feed page carry no place photo at all; the only `photo_url`
  in `src/pages/FeedPage.tsx:1153` is a hardcoded `null`.

### 2.4 There is no upload path and no report path for a place photo

- **No place-photo storage bucket exists.** The only buckets declared anywhere in
  `supabase/migrations/` are: `avatars` (`0011_profiles_v2.sql:154`),
  `kid-photos` (`0038_kid_photo_storage.sql:274`, re-pinned at
  `0054_kid_photos_read_authenticated.sql:144`, both `public = false`). There is
  no `places` bucket, no place-photo path convention, and no policy granting
  anyone write access to a place image.
- **The app has no write path to `places` at all** — the seed is the only writer
  (`supabase/migrations/0029_places.sql:396`,
  `src/lib/types.ts:283-285`).
- **The existing `reports` table cannot reference a photo.** `public.reports`
  has exactly `playdate_id` and `reported_profile_id`
  (`supabase/migrations/0008_create_reports.sql:18-26`). There is no `place_id`
  column and no image reference, so "report this photo" is not a value the
  current schema can store — it would need a migration.
- The only client-side `storage.from(...)` call is
  `client.storage.from('avatars')` (`src/lib/db.ts:2571`). No place-image
  upload seam exists.

### 2.5 The live database — measured this session (read-only)

`places` is anon-readable, so these counts come from the production REST API
using the repo's own anon key, on `dcd008e`. Counts via `Prefer: count=exact`:

| Query | Result |
|---|---|
| `places` total | **239** |
| `photo_url=not.is.null` | **121** |
| `photo_attribution=not.is.null` | **121** |

This matches V18's recorded end state (`.scratch/v18/ledger.md:240`: "places =
239 rows / 121 with photo / 0 incomplete"). **So the data V20 t01 stopped
rendering is still live, still public, and still attributed — and no surface
shows it.**

Every one of the 121 URLs is a `thumb.wikimedia.org` / `upload.wikimedia.org`
hotlink. I HEAD-checked all 121: **119 × `200` (content-type `image/jpeg` or
`image/png`), 2 × `429` on the first pass** — the second pass produced 1 × `429`
on a different row (`Lincoln Park - Beach`), i.e. the rate-limiting is
**intermittent, not a dead link**. This matters for §3 and §7.

**The live data contains the exact wrong-subject failures V17 predicted, and
they are currently public.** Sampling four rows:

- `Alki Playground` → `Seattle_-_Senior_Citizen_Walking_Club_...`, CC BY 2.0 —
  the 1980 seniors' outing that `.scratch/v17/spec.md:138` flagged as **NO**.
  It was approved anyway: `.scratch/v18/ledger.md:210` records the founder's
  ruling "keep all for now" → all 121 Tier 1 approved.
- `Atlantic Street Park` → `Seattle_-_People_using_exercise_equipm...` — same
  Seattle Municipal Archives batch.
- `Green Lake Park (East)` and `Green Lake Park (West)` → images whose file names
  are *"Walkway over the lake, Green Park"* and *"The Lake, West Green House —
  geograp…"*, authored by **Des Blenkinsopp** and **Len Williams**. Those are
  English/Welsh names and this is the *Green Park / Green Lake* word collision
  the V17 measurement warned about — plausibly **Green Park, London**, on a
  **Seattle** park card.

I am not asserting those two are definitely wrong — I did not open the images or
their file pages. I am asserting they are *not verifiable from the stored
metadata*, which is worse for the stated goal ("photos that represent what they
are"). This is the strongest single piece of evidence in this memo: **the
pipeline's own quality signal was a filename-agreement heuristic, and it let a
known-bad image through.**

---

## 3. The privacy question

This app deliberately keeps children's images behind authentication, and V25
ticket 14 just widened exactly that: `0054_kid_photos_read_authenticated.sql`
replaces the owner-only kid-photo read policy so a kid's photo is readable by
other **signed-in** parents — bucket stays `public = false`
(`:144-146`). The founder's annotation 0 is the reason: *"I don't think the
photos should be private … if someone chooses to upload photos, other people
should be able to see them."* The bucket is still private; the **read** widened.

So the app's live posture is: **person photos are signed-in-only; place data is
public.** A place photo sits on the boundary and the choice is real:
`places` is anon-readable (`0029_places.sql:405-409`), so a `photo_url` on a
place is public **today** — all 121 are, right now.

### Option A — public (today's de-facto state)

`photo_url` stays a column on the anon-readable `places` row; the image is
hotlinked from a third-party CDN.

- *Consequence:* consistent with `places` being "public infrastructure"
  (`0029_places.sql:106-109`) — the signed-out place page is a supported surface.
  No new bucket, no policy change, no migration.
- *Consequence:* the third-party CDN sees the IP of every visitor; the app cannot
  state anything about that to a parent.
- *Consequence:* **the data is already public and un-audited.** Choosing
  "signed-in only" is a *migration*, not a render change — the 121 rows are
  readable by anon right now, which is how this memo measured them.

### Option B — signed-in only

Move to a private bucket (`public = false`, the `kid-photos` pattern) and gate
the read.

- *Consequence:* the bucket itself is a new migration; and gating the **render**
  is not enough, because `places.photo_url` is served inside the anon-visible
  place row. A genuine signed-in-only photo needs either a separate table with
  its own RLS, or a column-level revoke on `places` — whose own migration
  comment calls out the house rule that "adding a column does not, and must not,
  quietly re-scope a table's policies"
  (`0046_place_photo_attribution.sql:41-44`). Expect that to be a reviewed
  migration, not a flag.
- *Consequence:* the app gains a second photo storage class and a second read
  posture (kid photos and place photos both signed-in, but with different
  lifecycle and different writers). More surface, more tests.
- *Consequence:* it contradicts the founder's own stated direction on annotation
  0 — he asked for **more** visibility, not less.
- *Consequence:* a signed-in-only gate does nothing about the actual failure
  mode in §2.5. A wrong photo seen by a signed-in parent is still a wrong photo.

### Option C — user-uploaded, with the licence problem

The founder's own suggestion ("upload a photo that looks better if they wanted
to share their own photos").

- *Consequence:* **the licence is the hard part, not the storage.** A user
  upload is not automatically licensed to the app. The app needs an explicit
  grant — a checkbox that is legally meaningful, plus the `photo_license` /
  `photo_attribution` columns populated *from the uploader*, which changes what
  those columns mean (today they describe a Commons file; `photo_source_url` is
  "the Commons FILE PAGE" per `src/lib/types.ts:315-319`). Using Commons
  semantics for user content would make the existing provenance field lie.
- *Consequence:* moderation. A user photo of a place is a public, unmoderated
  image upload on a children's app — a materially bigger risk than a person
  photo behind auth, because it is public by default. The app has moderation
  primitives (`src/lib/moderation.ts:24`, `:71`; `0050`'s `hidden_at` pattern) but
  nothing wired to a place image.
- *Consequence:* **it re-creates the burden the founder was trying to escape.**
  He said he cannot "police this and fix all the broken images"; uploads plus a
  report loop is a permanent policing duty, which is strictly more ongoing work
  than the one-time curation he rejected.

### Option D — "report an inaccurate photo"

Cheap *symptom* handling, not a fix.

- *Consequence:* `public.reports` cannot store it
  (`0008_create_reports.sql:18-26` — no `place_id`, no image reference), so it
  needs a migration either way.
- *Consequence:* a report queue that nobody works is a worse product than no
  report button — it tells a parent their concern was heard and then files it.
  Only worth building if the founder commits to working the queue.

**The privacy verdict.** The privacy question is *not* the blocker here. A place
photo is not personal data about a family, so it does not belong in the same
class as a kid photo, and the app already publishes it. The blocker is
**accuracy**, and Option B — the intuitive "protect it like the kid photos"
move — does not touch it.

---

## 4. Where a photo would render

Named because the ticket requires it, and because the choice changes the cost.

- **The card** `DirectoryRow` (`src/components/PlaceDirectory.tsx:1191-1352`).
  At 320px this is a single-column, text-dense card: name + heart on one row,
  then 3-4 lines of `text-xs` metadata, then a `flex-wrap` action row
  (`:1320-1348`). A thumbnail competes with the heart for the top-right and
  pushes 3 lines of text below the fold on a small phone. The kind glyph
  already occupies the chip at `:698`; a card image would be the second
  visual vocabulary in the same view.
- **The place page** (`src/pages/PlacePage.tsx`). The founder's own sequence at
  `src/pages/PlacePage.tsx:43-48` puts the picture between the name (`:372`)
  and the description (`:412-416`), i.e. the slot V20 t01 emptied at `:379-405`.
  There is room here; this is the lower-risk surface.
- **Feed map / feed card** — no photo column is read at all
  (`src/pages/FeedPage.tsx:1153` hardcodes `null`). Out of scope today.

Dark appearance: the card is `bg-white` with `text-slate-900`/`600`
(`src/components/PlaceDirectory.tsx:1247-1258`); the app is mid-V25-t12
(white-background work), and this memo did not audit the dark pass — a photo
would need an explicit dark treatment, which is unowned (§7 preserves that as a
prerequisite rather than a claim).

---

## 5. The data-source question

External facts below were gathered **this session**; each carries the URL I
actually read, or an explicit "could not verify".

### 5.1 Google Places / Maps photos — **NO, and the reason is louder than photos**

The blocker is in the Google Maps Platform Terms of Service, §3.2.3
(*Restrictions Against Misusing the Services*), clause (a) *No Scraping*, quoted
verbatim from <https://cloud.google.com/maps-platform/terms/>:

> "**Customer will not export, extract, or otherwise scrape Google Maps Content
> for use outside the Services.** For example, Customer will not: (i) pre-fetch,
> index, store, reshare, or rehost Google Maps Content outside the services;
> (ii) bulk download Google Maps tiles, Street View images, geocodes,
> directions, distance matrix results, roads information, **places
> information**, elevation values, and time zone details; (iii) copy and save
> business names, addresses, or user reviews; or (iv) use Google Maps Content
> with text-to-speech services."

and §3.2.3(b) *No Caching*:

> "Customer will not cache Google Maps Content except as expressly permitted
> under the Maps Service Specific Terms."

That is the founder's instinct answered directly: **you may not store and
re-serve a Google place photo.** Writing it into `places.photo_url` is
"(i) … store … or rehost Google Maps Content outside the services."

**The sharper finding — §3.2.1, verbatim, same document:**

> "…or (c) access or use the Services: … (vi) in a Customer Application that
> would be deemed to be a 'Website or online service directed to children' under
> the Children's Online Privacy Protection Act (COPPA)."

This is a **children's playdate app**. If the app is "directed to children"
under COPPA, then *using Google Maps Platform at all* is outside the permitted
use — which is a larger question than place photos and I flag it as such rather
than deciding it: whether Drop In is "directed to children" under COPPA is a
legal characterisation I cannot make. What I can report is that the clause
exists, it says what it says, and the app already links out to Google Maps
(`placeOutboundLinks`, cited in `src/pages/PlacePage.tsx:421-425`) — a different
thing from an API integration, but adjacent enough that the founder should see
the sentence.

Cost: I **could not verify** the current Place Photos SKU price or free
allowance. The pricing pages
(<https://developers.google.com/maps/billing-and-pricing/pricing>,
<https://mapsplatform.google.com/pricing/>) render their tables client-side and
returned no price text to a static fetch. Because the terms answer is already
"no", I did not chase the number; treat the price as unknown rather than
reciting a third-party blog figure.

### 5.2 Mapbox — not a photo source at all

Mapbox sells **maps**, not venue photographs. There is no venue-photo product to
license; the closest product is a *map render* of the place, which is an
illustration of the location, not "a photo of what it looks like."

For completeness, from <https://www.mapbox.com/pricing/> (read this session):
**Static Images API** — free up to **50,000 requests/month**, then **$1.00 per
1,000** (50,001-500,000), $0.80 (500,001-1M), $0.60 (1M+). A single request is
"a PNG image with customizable height and width generated from a GL style."
Geocoding API is free up to 100,000 requests/month, then $0.75/1,000.

Using a static map as a card image would be: a new vendor, a new API key, a new
billing relationship, a `Leaflet`→Mapbox-adjacent stack question (the app is
`leaflet@^1.9.4` on OSM raster tiles, `src/components/PlaceMap.tsx:49`), and
Mapbox's own attribution requirements — which I **could not verify** verbatim:
<https://www.mapbox.com/legal/tos> returned 433 KB of text that contained no
"Attribution Requirements" section matching my search terms from a static fetch.
Do not treat Mapbox attribution as settled.

**Verdict:** answers a different question. It can make a card look better; it
cannot make a card show *the place*.

### 5.3 OpenStreetMap-linked imagery — measured, and it is essentially zero

I probed Overpass API (OverpassQL, `nwr[...]["image"](area.a)` for Seattle,
`admin_level=8`) across exactly the venue categories the seed covers:
`leisure=playground`, `leisure=park`, `leisure=swimming_pool`,
`amenity=library`, `tourism=museum`, `natural=beach`.

**Result: 1 element in all of Seattle carried an `image` tag** — and it was the
one I would have guessed, *The Seattle Public Library - Central Library*, whose
tag points at
`https://commons.wikimedia.org/wiki/File:Seattle_(WA,_USA),_Seattle_Central_Library_--_2022_--_200930.jpg`.

That is the honest answer to "is there an OSM-linked image source?": yes, it
exists, it is licence-clean (it points at Commons, and it has an actual
`whc:heritage_status`-class reviewer behind it), and it covers **1 of 239**. It
is worth *harvesting* for the handful of rows that have it — those are the
highest-confidence images available, because a human mapper asserted the link —
but it is not a strategy.

Mapillary (Meta-owned street-level imagery, CC BY-SA) was considered and I
**could not verify** its current terms: `help.mapillary.com` returns **403**
behind Cloudflare to every fetch method I tried (curl with a browser
User-Agent, and the fetch tool), and `mapillary.com/terms` and `/legal` return
**400**. I am therefore not asserting what Mapillary's licence does or does not
permit. Independently of the licence, it is the wrong artifact: a dashcam frame
of the street outside a playground is not "a photo of what it looks like," and it
carries the same *which* venue identification problem as a name search — worse,
since a street frame has no name at all.

### 5.4 Wikimedia Commons — the only source that is both legal and already built

- **Licence.** Commons images are freely licensed, and reuse — including
  **storing the file** — is explicitly contemplated. The Wikimedia Foundation
  Terms of Use, *Re-use* section
  (<https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use>) says reuse is
  welcome, that "Any reuse must comply with the underlying license(s)," and that
  "For any non-text media, you agree to comply with the applicable license under
  which the work has been made available."
- **Attribution is mandatory for CC BY / CC BY-SA.** Commons' own reuse guide
  (<https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia>)
  lists the steps: *"Use it: Download or hotlink the file, and use it."* then
  *"Attribution: If attribution is required, provide attribution."* and
  *"Specify license details: If the license requires you to link to or provide a
  copy of the license, do this."* This is precisely what `photoCreditLine`
  (`src/lib/places.ts:1048`) and the four `0046` columns exist to satisfy.
- **Hotlinking is permitted but "not recommended."** Same page, verbatim:
  *"Directly using a Commons file via embedding its URL ('hotlinking') is also
  possible, but is not recommended."* This is the source of the intermittent
  `429`s I measured in §2.5 — the app currently does the thing Commons says not
  to do.
- **Commons does not warrant the licence.** Same page, verbatim: *"While the
  copyright and licensing information supplied for each image is believed to be
  accurate, the Wikimedia Foundation does not provide any warranty regarding the
  copyright status or correctness of licensing terms. If you decide to reuse
  files from Commons, you should verify the copyright status of each image just
  as you would when obtaining images from other sources."* And on top of licence:
  *"commercial use of images of people may require the explicit agreement of the
  subject."* The app does not warrant its licences by relying on the pipeline
  alone.
- **Measured coverage and measured quality.** V17 §4.1.2
  (`.scratch/v17/spec.md:117-142`) measured a **~80% hit rate** on real seeded
  names with **no non-free licence** appearing, and a materially lower *usable*
  rate. V18 (`.scratch/v18/ledger.md:26-33`, `:240`) took it to a full run:
  **239 → 217 hits / 22 none / 0 failed**, split into **134 reviewable / 83
  doubtful**, then shipped **121 applied and live**. The doubtful tier is where
  the wrong-subject images live, and §2.5 shows at least two known-bad rows
  shipped anyway.

### 5.5 The official operator website — technically the founder's best instinct, legally per-site

The live DB has **55 of 239** places with a `website_url` (measured this
session; e.g. `Green Lake Park (East)` → `https://seattle.gov/parks/parks/green-lake-park`).
V20 t01 established that column with exactly the discipline this question needs:
"filled only by the reviewed backfill for rows where an official page was
verified reachable and about that place" (`src/lib/types.ts:334-346`).

- **Precedent:** there is already a *reviewed, frozen, human-verified* per-place
  URL on the row. Reusing that pattern for an image URL is architecturally
  consistent with the app's own history.
- **Provenance:** an official operator page is the best possible answer to "is
  this *this* place" — the operator is the authority.
- **The problem:** mixed, per-site terms. 55 sites is 55 licences, and I did not
  audit them. `seattle.gov` (city government) is the majority and may have
  permissive terms, but "may" is doing real work there and I am not asserting it.
  The failure mode is quiet: a wrong assumption here is a copyright problem, not
  a broken `<img>`.
- **The technical problem: hotlinking an operator's image usually breaks.**
  Operators block it, move it, or re-generate the URL. So this path implies
  **download and store**, which is the new-bucket prerequisite in §8 — the
  cheap "just point an `<img>` at their site" version is the version most likely
  to produce the broken images the founder complained about.

---

## 6. Cost, coverage, verification — the four axes side by side

| Source | Licence: may we store + re-serve? | Cost | Coverage of the 239 | Verification cost |
|---|---|---|---|---|
| **Google Places/Maps** | **No** — ToS §3.2.3(a)(i) "store, reshare, or rehost"; §3.2.3(b) no caching. Plus §3.2.1(c)(vi) bars use in a child-directed app. | Price unknown (pages JS-rendered) — moot | n/a | n/a — prohibited |
| **Mapbox Static Images** | Yes, but it is a map render, not a venue photo | Free ≤50k req/mo, then $1.00/1,000 | 239/239 — and all of them wrong | n/a — it is not a photo |
| **OSM `image`-tagged imagery** | Yes (tags point at Commons) | Free (Overpass) | **1/239** (measured) | **Zero** — a human mapper already asserted the link |
| **Wikimedia Commons** | **Yes** — download or hotlink, with attribution; WMF does not warrant the licence | Free; fair-use guideline + User-Agent required, 429s under load | V18: 217/239 had a hit; **121 applied** (51%) | **High, and it is the whole problem** — 83/217 doubtful; ≥2 known-bad shipped (§2.5) |
| **Official operator site** | Per-site, **unverified** — 55 candidate sites | Free-ish, but needs per-site review | 55/239 have a *website*; unknown how many have a usable *image* | Medium — operator is authoritative for identity, but terms are per-site |
| **User upload** | Yes with an explicit grant; `photo_license` semantics must change | Dev cost only; a new bucket + moderation | Grows with engagement; 0 today | Shifts to moderation + a report queue; **re-creates ongoing policing** |

### The verification problem, as the centre of the memo

V17 measured the failure: `Warren G Magnuson` → *a congressman's portrait*,
`Alki Playground` → *a 1980 seniors' outing*, `Ballard Community Center` →
*marginal — historical, not current* (`.scratch/v17/spec.md:133-139`). V18 then
built the mitigation — fetch → **human candidate sheet** → apply only `"keep"`
rows (`.scratch/v18/ledger.md:203-213`) — and V18's *own* count says the
mitigation was weak: **83 of 217 hits doubtful**, and the founder's ruling was
"keep all for now" (`.scratch/v18/ledger.md:210`), which is how the 1980 seniors'
outing became the photo of Alki Playground.

The five approaches the ticket names, with cost and failure mode:

1. **Confidence threshold + automatic rejection.** *Cost:* near zero. *Failure
   mode:* it is the heuristic that already failed. Filename agreement cannot see
   the difference between a Seattle park and a London one (`Green Lake Park` vs
   *Green Park*). A threshold that rejects the doubtful tier rejects 83 of 121 —
   leaving ~38 photos, i.e. 16% of the directory.
2. **User report affordance.** *Cost:* a migration (`reports` cannot store it —
   `0008_create_reports.sql:18-26`), a control, and a queue. *Failure mode:*
   reports arrive only *after* a parent saw a wrong photo; an unworked queue is
   worse than no button. Also: it relies on a parent knowing the venue is
   misrepresented, which the founder himself could not do for 83 images.
3. **User upload affordance.** *Cost:* a storage bucket, RLS, a licence grant,
   moderation, and a target for *replacement* photos. *Failure mode:* it is a
   permanent policing duty — the exact sentence that killed V18 ("I can't police
   this and fix all the broken images", `src/pages/PlacePage.tsx:385-386`).
4. **One-time-reviewed-then-frozen set.** *Cost:* one human pass over a bounded
   set, then never again. *Failure mode:* images can go stale (a playground is
   rebuilt) and a frozen URL can still rot — the app would need a periodic
   liveness check, which is small but not zero. **This is the only option whose
   cost does not grow with user count.**
5. **Photos only where a human already said yes.** *Cost:* zero new work. *Failure
   mode:* it is not a photo strategy — it yields the ~38 unambiguous rows (and
   1 from OSM), so 84% of the directory keeps the kind illustration.

**On the founder's "can't manage this at scale" constraint.** The arithmetic is
worth putting in front of him, because it reframes his premise. 121 rows applied,
83 flagged doubtful. At ~20 seconds per image — open it, confirm or reject —
that is **~41 minutes for all 121**, or ~28 minutes for the 83 doubtful ones.
That is a one-time pass, not "manual management at scale". His objection in
`src/pages/PlacePage.tsx:385-386` is about **ongoing** work ("fix all the broken
images"), and a frozen, reviewed set is not ongoing work. I am reporting this as
a measurement, not as a proposal that overrides him — he may still reject the
41 minutes, and that is a legitimate decision. But "at scale" is not the
obstacle: **41 minutes is.**

---

## 7. Recommendation

**Do not add a photo to the card. Ship the kind illustration as the card's
visual, and confine photos to the place page — where the founder's own sequence
already puts them (`src/pages/PlacePage.tsx:43-48`) — with a photo shown only if
a human has confirmed it is that place. Harvest the OSM `image`-tagged rows
first (they are free and already verified), then run one bounded review pass over
the 121 live rows, freezing the confirmed set and nulling the rest.**

This is Option 5 in §6, not Option 4 — the difference is that I am recommending
the *floor* (human-confirmed only) as the strategy, with a review pass as the way
to raise it, rather than assuming the pass happens.

Why this and not the alternatives:

- It is the only option that does not depend on a heuristic that has already
  failed on this exact data (§2.5, §6).
- It costs no new vendor, no new key, and no new bucket for the initial state —
  the machinery (`0046`, `photoCreditLine`) already exists and is tested.
- It removes the founder's actual, stated pain. He said "I can't police this and
  fix all the broken images"; the current state is 121 publicly-served hotlinks
  with at least two known-wrong, plus intermittent Wikimedia `429`s. Nulling the
  unconfirmed rows is *fewer* things to police, not more.
- It matches V20 t01's lesson, which the ticket asks to state explicitly: **a
  half-broken gallery reads worse than none.** A place page that shows a
  verified photo for 40 places and nothing for the rest is honest; a card that
  shows a grey placeholder, or a seniors' outing from 1980 labelled *Alki
  Playground*, is not.

### The single strongest argument against it

**It gives up on the founder's actual complaint.** He did not say "add photos
correctly" — he said the places "don't look very interesting or compelling." The
121 photos already live cover 51% of the directory; a human-confirmed-only policy
would keep roughly the ~38 rows outside V18's doubtful tier (and 1 from OSM) —
call it **~16% coverage, with ~84% of places left on the kind illustration** —
and mixed coverage, some cards with images and most without, can read as *more*
broken and less deliberate than a uniform, illustrated directory. If the goal is
visual appeal rather than literal representation, then a consistent
kind-illustrated card or a uniform Mapbox static-map render may beat a sparse
real-photo gallery, and this recommendation optimises for the wrong variable.
**I cannot settle that with code or sources**: it is a product judgment about
whether "representative" or "attractive" is the goal, and the founder is the only
one who can make it.

### Residual risk, one sentence

If the reviewed set is frozen and the underlying file is later renamed or
deleted on Commons, the app shows a broken image with a correct credit line under
it — which is a smaller and more honest failure than today's wrong image with a
correct credit line, but it is not zero.

### Follow-up tickets this implies

Ranked; **do now** first.

1. **Do now — the accuracy audit.** One pass over the 121 live rows: confirm,
   correct, or null. This is the only item that prevents a *currently public*
   wrong photo. It also settles the coverage number the other decisions need.
2. **Do now — the OSM harvest.** A tiny, licence-clean win: query Overpass for
   the seed's names/categories and apply `image` tags that point at Commons.
   Measured ceiling: 1 row today, but that number should be re-measured against
   the real 239 (my probe used OSM category tags, not the seed's own
   coordinates, so this is a lower bound).
3. **Later — storage instead of hotlinking.** Download confirmed images into a
   bucket. This removes the `429`/hotlink fragility that Commons itself calls
   "not recommended", at the cost of a new bucket, and it is the prerequisite for
   the official-website path (§5.5).
4. **Later — the report/upload affordances.** Only after 1-3, and only with an
   explicit owner for the queue. This needs a migration (`reports` has no
   `place_id`) and a change to what `photo_license` means.
5. **Later — the venue/category data source** (V25 follow-ups §D item 17). The
   photo question is downstream of it: you cannot source a photo for a kind you
   cannot source a place for.

---

## 8. What would have to be true to build it

- **A decision on the goal: "representative" or "attractive."** Everything below
  is cheap if the answer is "attractive" (a uniform illustration or map render)
  and expensive if it is "representative" (per-image truth). Nothing in this memo
  can substitute for that answer.
- **A human pass over the 121 live rows** — or an explicit decision to null all
  121 and start from the OSM + reviewed subset. This is the load-bearing
  prerequisite; without it, any render re-ships two known-wrong images.
- **A decision on the privacy posture** — public (today, no migration) or
  signed-in (a real migration, because `places.photo_url` is anon-readable
  today, and per `0046`'s own comment a column must not silently re-scope the
  table).
- **If storing rather than hotlinking:** a private `place-photos` bucket, its RLS
  policies, and a place-photo path convention — none of which exist
  (`0038`/`0054` cover `kid-photos` only).
- **If showing an operator-website image:** a per-site terms review of the 55
  sites with a `website_url`, since I verified none of their licences.
- **If accepting user uploads:** an explicit licence grant at upload, a decision
  on what `photo_license`/`photo_source_url` mean for user content, a moderation
  path, and a named owner for the report queue.
- **A render decision for both surfaces** — which of the card
  (`PlaceDirectory.tsx:1191-1352`) and the place page (`PlacePage.tsx`, the slot
  at `:379-405`) gets a photo, and the 320px + dark-appearance treatment for
  each. Note that both e2e specs currently assert *absence*
  (`e2e/places.e2e.ts:1748`, `:1750`), so any render also updates those.
- **A liveness check** for whatever set is frozen, so a renamed Commons file
  degrades to "no photo" rather than a broken `<img>`.

---

## 9. What I could not verify

- **Google's current Place Photos price and free allowance.** The pricing pages
  render client-side and returned no price text
  (<https://developers.google.com/maps/billing-and-pricing/pricing>). Moot for
  the recommendation, but not verified.
- **Mapbox's verbatim attribution requirements.** I read
  <https://www.mapbox.com/legal/tos> (433 KB fetched) but found no section
  matching "Attribution Requirements" in a static read.
- **Mapillary's current terms.** `help.mapillary.com` → **403** (Cloudflare),
  `mapillary.com/terms` and `/legal` → **400**, `graph.mapillary.com` → **500**,
  `mapillary.com/developer/api-documentation` → **400**. I therefore assert
  nothing about Mapillary's licence, cost, or coverage.
- **Whether the two `Green Lake` images are actually of Green Park, London.** I
  read the stored author and file-name metadata only; I did **not** open the
  images or their Commons file pages. The claim I stand behind is weaker and
  sufficient: the stored metadata does not establish that they are the Seattle
  park.
- **Whether any of the 55 `website_url` sites license their images for re-serving.**
  Not audited.
- **Whether Drop In is "directed to children" under COPPA** for the purposes of
  Google Maps Platform §3.2.1(c)(vi). I can only report that the clause exists
  and quote it.
- **The exact list of wrong images among the 121.** I sampled; I did not audit.
  Producing that list is follow-up ticket 1.

---

### Provenance of claims in this memo

- Every codebase claim cites `file:line` in this worktree at `dcd008e`.
- Live-DB counts and status codes were measured this session against the
  production Supabase project via the repo's own anon key, read-only
  (`Prefer: count=exact`). No DB write was made.
- The Overpass measurement was a live query this session (Seattle,
  `admin_level=8`, six venue categories).
- Every external claim carries the URL I read, or an explicit "could not
  verify".
